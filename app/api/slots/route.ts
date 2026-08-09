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
      .filter((slot) => slot.dateTime && slot.formUrl && slot.spacesRemaining > 0);

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
