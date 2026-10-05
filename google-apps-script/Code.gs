const BOOKING_CONFIG = Object.freeze({
  spreadsheetId: "1TEYqAojuGre9Zht_Ix0FqTTkD2_uwcjRWocOgGhT1fA",
  classSheetName: "課堂資料",
  responseSheetName: "表單回覆 3",
  lessonMinutes: 60,
  timeZone: "Asia/Hong_Kong",
});

function doPost(event) {
  const lock = LockService.getScriptLock();

  try {
    const payload = JSON.parse(event && event.postData ? event.postData.contents : "{}");
    lock.waitLock(15000);

    try {
      return jsonOutput(processBooking(payload));
    } finally {
      lock.releaseLock();
    }
  } catch (error) {
    console.error(error);
    return jsonOutput({ ok: false, code: "SERVER_ERROR" });
  }
}

function processBooking(payload) {
  const name = safeText(payload.name, 80);
  const phone = safeText(payload.phone, 30);
  const phya = safeText(payload.phya, 30);
  const requestedLabel = normalizeSlotLabel(safeText(payload.slot, 100));
  const phoneDigits = normalizeDigits(phone);
  const phyaDigits = normalizeDigits(phya);

  if (!name || phoneDigits.length !== 8 || phyaDigits.length < 7 || !requestedLabel) {
    return { ok: false, code: "INVALID" };
  }

  const spreadsheet = SpreadsheetApp.openById(BOOKING_CONFIG.spreadsheetId);
  const classSheet = spreadsheet.getSheetByName(BOOKING_CONFIG.classSheetName);
  const responseSheet = spreadsheet.getSheetByName(BOOKING_CONFIG.responseSheetName);

  if (!classSheet || !responseSheet) {
    throw new Error("Required booking sheets are missing");
  }

  const slots = readSlots(classSheet);
  const requestedSlot = slots.byLabel[requestedLabel];
  const now = new Date();

  if (!requestedSlot || requestedSlot.start.getTime() <= now.getTime()) {
    return { ok: false, code: "SLOT_UNAVAILABLE" };
  }

  const responses = readResponses(responseSheet);
  const existingForPatient = responses
    .filter(function (row) {
      return row.phyaDigits && row.phyaDigits === phyaDigits;
    })
    .map(function (row) {
      return {
        row: row,
        slot: slots.byLabel[normalizeSlotLabel(row.slotLabel)],
      };
    })
    .filter(function (entry) {
      return entry.slot && entry.slot.end.getTime() > now.getTime();
    })
    .sort(function (left, right) {
      return left.slot.start.getTime() - right.slot.start.getTime();
    });

  if (existingForPatient.length > 0) {
    const active = existingForPatient[0].slot;
    return {
      ok: false,
      code: normalizeSlotLabel(active.label) === requestedLabel ? "SAME_SLOT" : "ACTIVE_BOOKING",
      activeSlot: active.label,
      activeUntil: formatDateTime(active.end),
    };
  }

  const uniquePatients = {};
  responses.forEach(function (row) {
    if (normalizeSlotLabel(row.slotLabel) !== requestedLabel) return;
    const identity = row.phyaDigits
      ? "P" + row.phyaDigits
      : row.phoneDigits
        ? "T" + row.phoneDigits
        : "";
    if (identity) uniquePatients[identity] = true;
  });

  if (Object.keys(uniquePatients).length >= requestedSlot.maxCapacity) {
    return { ok: false, code: "FULL" };
  }

  appendResponse(responseSheet, {
    timestamp: now,
    slotLabel: requestedSlot.label,
    name: name,
    phone: phone,
    phya: phya,
  });
  SpreadsheetApp.flush();

  return { ok: true };
}

function readSlots(sheet) {
  const lastRow = sheet.getLastRow();
  const result = { byLabel: {} };
  if (lastRow < 2) return result;

  const range = sheet.getRange(2, 1, lastRow - 1, 5);
  const values = range.getValues();
  const displayValues = range.getDisplayValues();

  values.forEach(function (row, index) {
    const label = String(displayValues[index][1] || "").trim();
    const start = row[1] instanceof Date ? new Date(row[1].getTime()) : null;
    const maxCapacity = Number(row[2] || 0);
    if (!label || !start || isNaN(start.getTime()) || maxCapacity <= 0) return;

    result.byLabel[normalizeSlotLabel(label)] = {
      label: label,
      start: start,
      end: new Date(start.getTime() + BOOKING_CONFIG.lessonMinutes * 60 * 1000),
      maxCapacity: maxCapacity,
    };
  });

  return result;
}

function readResponses(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  return sheet
    .getRange(2, 1, lastRow - 1, 5)
    .getDisplayValues()
    .map(function (row) {
      return {
        slotLabel: String(row[1] || "").trim(),
        phoneDigits: normalizeDigits(row[3]),
        phyaDigits: normalizeDigits(row[4]),
      };
    })
    .filter(function (row) {
      return row.slotLabel;
    });
}

function appendResponse(sheet, booking) {
  const nextRow = sheet.getLastRow() + 1;
  if (nextRow > sheet.getMaxRows()) {
    sheet.insertRowsAfter(sheet.getMaxRows(), nextRow - sheet.getMaxRows());
  }

  const target = sheet.getRange(nextRow, 1, 1, 5);
  target.getCell(1, 4).setNumberFormat("@");
  target.getCell(1, 5).setNumberFormat("@");
  target.setValues([[
    booking.timestamp,
    booking.slotLabel,
    booking.name,
    booking.phone,
    booking.phya,
  ]]);
}

function safeText(value, maxLength) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function normalizeDigits(value) {
  return String(value || "").replace(/[^0-9]/g, "");
}

function normalizeSlotLabel(value) {
  return String(value || "")
    .replace(/：/g, ":")
    .replace(/\s+/g, " ")
    .trim();
}

function formatDateTime(value) {
  return Utilities.formatDate(value, BOOKING_CONFIG.timeZone, "d/M/yyyy a h:mm");
}

function jsonOutput(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
