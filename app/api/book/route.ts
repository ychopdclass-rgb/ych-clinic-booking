import { NextResponse } from "next/server";

export const runtime = "nodejs";

type BookingRequest = {
  name?: unknown;
  phone?: unknown;
  phya?: unknown;
  slot?: unknown;
};

type ScriptResponse = {
  ok?: boolean;
  code?: string;
  activeSlot?: string;
  activeUntil?: string;
};

function text(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function digits(value: string) {
  return value.replace(/[^0-9]/g, "");
}

function errorResponse(message: string, status: number) {
  return NextResponse.json(
    { ok: false, message },
    { status, headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}

export async function POST(request: Request) {
  const scriptUrl = process.env.BOOKING_SCRIPT_URL?.trim();
  if (!scriptUrl) {
    return errorResponse("預約服務暫時未完成設定，請稍後再試。", 503);
  }

  let body: BookingRequest;
  try {
    body = (await request.json()) as BookingRequest;
  } catch {
    return errorResponse("提交資料格式不正確，請重新輸入。", 400);
  }

  const name = text(body.name, 80);
  const phone = text(body.phone, 30);
  const phya = text(body.phya, 30);
  const slot = text(body.slot, 100);
  const phoneDigits = digits(phone);
  const phyaDigits = digits(phya);

  if (!name || phoneDigits.length !== 8 || phyaDigits.length < 7 || !slot) {
    return errorResponse("請填寫姓名、8 位數字聯絡電話及有效的 PHYA 號碼。", 400);
  }

  try {
    const response = await fetch(scriptUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ name, phone, phya, slot }),
      cache: "no-store",
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      throw new Error(`Booking service returned ${response.status}`);
    }

    const result = (await response.json()) as ScriptResponse;
    if (result.ok) {
      return NextResponse.json(
        { ok: true },
        { headers: { "Cache-Control": "no-store, max-age=0" } },
      );
    }

    if (result.code === "ACTIVE_BOOKING" || result.code === "SAME_SLOT") {
      return NextResponse.json(
        {
          ok: false,
          code: result.code,
          activeSlot: result.activeSlot,
          activeUntil: result.activeUntil,
          message: result.activeSlot
            ? `您已有一個尚未完成的預約：${result.activeSlot}。請於該課堂完結後再申請另一時段。`
            : "您已有一個尚未完成的預約，請於該課堂完結後再申請另一時段。",
        },
        { status: 409, headers: { "Cache-Control": "no-store, max-age=0" } },
      );
    }

    if (result.code === "FULL") {
      return errorResponse("此時段剛剛額滿，請選擇另一個時段。", 409);
    }

    if (result.code === "SLOT_UNAVAILABLE") {
      return errorResponse("此時段已經開始、完結或不再接受預約，請選擇另一個時段。", 410);
    }

    if (result.code === "INVALID") {
      return errorResponse("提交資料不正確，請檢查後再試。", 400);
    }

    throw new Error(`Unexpected booking result: ${result.code ?? "unknown"}`);
  } catch (error) {
    console.error("Unable to submit booking", error);
    return errorResponse("暫時未能提交預約，請稍後再試。", 502);
  }
}
