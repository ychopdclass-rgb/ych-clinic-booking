import { NextResponse } from "next/server";

// These values are public identifiers, not credentials. Forks can override them
// with environment variables without changing the source code.
const SHEET_ID =
  process.env.GOOGLE_SHEET_ID?.trim() ||
  "1TEYqAojuGre9Zht_Ix0FqTTkD2_uwcjRWocOgGhT1fA";
const SHEET_NAME = process.env.GOOGLE_SHEET_NAME?.trim() || "課堂資料";

type GoogleCell = { v?: string | number; f?: string } | null;

type GoogleTable = {
  table?: {
    rows?: Array<{ c?: GoogleCell[] }>;
  };
};

function value(cell: GoogleCell): string | number {
  // Google Visualization serializes real date/time cells in `v` as strings
  // such as `Date(2026,7,10,10,30,0)`. Prefer the sheet's formatted value so
  // the website, form prefill, and booking records all use the same label.
  return cell?.f ?? cell?.v ?? "";
}

const HONG_KONG_UTC_OFFSET_MS = 8 * 60 * 60 * 1000;

function toHongKongTimestamp(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): number | null {
  const timestamp =
    Date.UTC(year, month - 1, day, hour, minute) - HONG_KONG_UTC_OFFSET_MS;
  const localTime = new Date(timestamp + HONG_KONG_UTC_OFFSET_MS);

  // Reject impossible dates instead of allowing JavaScript to roll them over.
  if (
    localTime.getUTCFullYear() !== year ||
    localTime.getUTCMonth() !== month - 1 ||
    localTime.getUTCDate() !== day ||
    localTime.getUTCHours() !== hour ||
    localTime.getUTCMinutes() !== minute
  ) {
    return null;
  }

  return timestamp;
}

function hour24(rawHour: number, period?: string): number | null {
  if (!period) return rawHour >= 0 && rawHour <= 23 ? rawHour : null;
  if (rawHour < 1 || rawHour > 12) return null;

  if (period === "上午" || period.toUpperCase() === "AM") {
    return rawHour === 12 ? 0 : rawHour;
  }

  return rawHour === 12 ? 12 : rawHour + 12;
}

function parseHongKongSlotTimestamp(dateTime: string): number | null {
  const text = dateTime.trim();

  // Google Sheets' raw date representation uses a zero-based month.
  const googleDate = text.match(
    /^Date\((\d{4}),(\d{1,2}),(\d{1,2}),(\d{1,2}),(\d{1,2})/,
  );
  if (googleDate) {
    return toHongKongTimestamp(
      Number(googleDate[1]),
      Number(googleDate[2]) + 1,
      Number(googleDate[3]),
      Number(googleDate[4]),
      Number(googleDate[5]),
    );
  }

  const dayFirst = text.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s*(上午|下午|AM|PM)?\s*(\d{1,2})[:：](\d{2})/i,
  );
  if (dayFirst) {
    const hour = hour24(Number(dayFirst[5]), dayFirst[4]);
    return hour === null
      ? null
      : toHongKongTimestamp(
          Number(dayFirst[3]),
          Number(dayFirst[2]),
          Number(dayFirst[1]),
          hour,
          Number(dayFirst[6]),
        );
  }

  const chineseDate = text.match(
    /^(\d{4})年(\d{1,2})月(\d{1,2})日(?:\s*星期[一二三四五六日天])?\s*(上午|下午|AM|PM)?\s*(\d{1,2})[:：](\d{2})/i,
  );
  if (chineseDate) {
    const hour = hour24(Number(chineseDate[5]), chineseDate[4]);
    return hour === null
      ? null
      : toHongKongTimestamp(
          Number(chineseDate[1]),
          Number(chineseDate[2]),
          Number(chineseDate[3]),
          hour,
          Number(chineseDate[6]),
        );
  }

  const yearFirst = text.match(
    /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})\s*(上午|下午|AM|PM)?\s*(\d{1,2})[:：](\d{2})/i,
  );
  if (yearFirst) {
    const hour = hour24(Number(yearFirst[5]), yearFirst[4]);
    return hour === null
      ? null
      : toHongKongTimestamp(
          Number(yearFirst[1]),
          Number(yearFirst[2]),
          Number(yearFirst[3]),
          hour,
          Number(yearFirst[6]),
        );
  }

  return null;
}

function isUpcomingSlot(dateTime: string, now: number): boolean {
  const startTime = parseHongKongSlotTimestamp(dateTime);

  // Keep an unfamiliar date format visible so a formatting change in the
  // spreadsheet cannot accidentally hide every available class.
  return startTime === null || startTime > now;
}

export async function GET() {
  try {
    const query = new URLSearchParams({
      tqx: "out:json",
      sheet: SHEET_NAME,
    });
    const sheetUrl = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?${query}`;
    const response = await fetch(sheetUrl, { cache: "no-store" });

    if (!response.ok) {
      throw new Error(`Google Sheets returned ${response.status}`);
    }

    const raw = await response.text();
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start === -1 || end === -1) throw new Error("Unexpected sheet response");

    const payload = JSON.parse(raw.slice(start, end + 1)) as GoogleTable;
    let lastClassName = "";
    const now = Date.now();

    const slots = (payload.table?.rows ?? [])
      .map((row, index) => {
        const cells = row.c ?? [];
        const explicitClassName = String(value(cells[0]) || "").trim();
        if (explicitClassName) lastClassName = explicitClassName;

        return {
          id: String(value(cells[5]) || `slot-${index + 2}`),
          className: lastClassName || "背部運動班",
          dateTime: String(value(cells[1]) || "").trim(),
          maxCapacity: Number(value(cells[2]) || 0),
          currentlyBooked: Number(value(cells[3]) || 0),
          spacesRemaining: Math.max(0, Number(value(cells[4]) || 0)),
          formUrl: String(value(cells[6]) || "").trim(),
        };
      })
      .filter(
        (slot) =>
          slot.dateTime &&
          slot.formUrl &&
          slot.maxCapacity > 0 &&
          isUpcomingSlot(slot.dateTime, now),
      );

    return NextResponse.json(
      { slots, updatedAt: new Date().toISOString() },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch (error) {
    console.error("Unable to load clinic slots", error);
    return NextResponse.json(
      { error: "Unable to load clinic slots" },
      { status: 502, headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  }
}
