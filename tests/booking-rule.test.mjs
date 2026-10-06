import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const scriptSource = await readFile(
  new URL("../google-apps-script/Code.gs", import.meta.url),
  "utf8",
);

function fixedDateClass(now) {
  return class FixedDate extends Date {
    constructor(...args) {
      super(...(args.length ? args : [now]));
    }

    static now() {
      return now;
    }
  };
}

class FakeRange {
  constructor(values, displayValues, onWrite) {
    this.values = values;
    this.displayValues = displayValues;
    this.onWrite = onWrite;
  }

  getValues() {
    return this.values;
  }

  getDisplayValues() {
    return this.displayValues;
  }

  getCell() {
    return { setNumberFormat() {} };
  }

  setValues(values) {
    this.onWrite?.(values[0]);
  }
}

class FakeSheet {
  constructor(rows, displayRows = rows.map((row) => row.map(String))) {
    this.rows = rows;
    this.displayRows = displayRows;
    this.writes = [];
  }

  getLastRow() {
    return this.rows.length + 1;
  }

  getMaxRows() {
    return 200;
  }

  insertRowsAfter() {}

  getRange(row, column, rowCount) {
    if (column === 1 && row === 2) {
      return new FakeRange(
        this.rows.slice(0, rowCount),
        this.displayRows.slice(0, rowCount),
      );
    }

    return new FakeRange([], [], (writtenRow) => this.writes.push(writtenRow));
  }
}

function bookingFixture(nowIso, responseRows) {
  const DateClass = fixedDateClass(Date.parse(nowIso));
  const classRows = [
    ["腰背健康運動班第4課", new DateClass("2026-10-08T05:45:00.000Z"), 3, 0, 3],
    ["腰背健康運動班第2課", new DateClass("2026-10-12T01:30:00.000Z"), 3, 0, 3],
  ];
  const classDisplayRows = [
    ["腰背健康運動班第4課", "8/10/2026 下午 1:45", "3", "0", "3"],
    ["腰背健康運動班第2課", "12/10/2026 上午 9:30", "3", "0", "3"],
  ];
  const classSheet = new FakeSheet(classRows, classDisplayRows);
  const responseSheet = new FakeSheet(responseRows, responseRows);
  const sheets = { 課堂資料: classSheet, "表單回覆 3": responseSheet };
  const context = vm.createContext({
    console,
    Date: DateClass,
    SpreadsheetApp: {
      openById() {
        return { getSheetByName: (name) => sheets[name] };
      },
      flush() {},
    },
    Utilities: {
      formatDate(value) {
        return value.toISOString();
      },
    },
    LockService: {},
    ContentService: {},
  });
  vm.runInContext(scriptSource, context);

  return { processBooking: context.processBooking, responseSheet };
}

const patient = {
  name: "Test Patient",
  phone: "61234567",
  phya: "PHYA26175957",
};

test("blocks another session while the patient's first lesson is active", () => {
  const { processBooking, responseSheet } = bookingFixture(
    "2026-10-05T04:00:00.000Z",
    [["2026/10/5", "8/10/2026 下午 1:45", "Test Patient", "61234567", "PHYA26175957"]],
  );

  const result = processBooking({ ...patient, slot: "12/10/2026 上午 9:30" });

  assert.equal(result.ok, false);
  assert.equal(result.code, "ACTIVE_BOOKING");
  assert.equal(result.activeSlot, "8/10/2026 下午 1:45");
  assert.equal(responseSheet.writes.length, 0);
});

test("allows a new session after the previous one-hour lesson has ended", () => {
  const { processBooking, responseSheet } = bookingFixture(
    "2026-10-08T06:46:00.000Z",
    [["2026/10/5", "8/10/2026 下午 1:45", "Test Patient", "61234567", "PHYA26175957"]],
  );

  const result = processBooking({ ...patient, slot: "12/10/2026 上午 9:30" });

  assert.equal(result.ok, true);
  assert.equal(responseSheet.writes.length, 1);
  assert.deepEqual(Array.from(responseSheet.writes[0].slice(1)), [
    "12/10/2026 上午 9:30",
    "Test Patient",
    "61234567",
    "PHYA26175957",
  ]);
});
