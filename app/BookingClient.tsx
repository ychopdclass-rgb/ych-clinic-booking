"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";

type Slot = {
  id: string;
  className: string;
  dateTime: string;
  maxCapacity: number;
  currentlyBooked: number;
  spacesRemaining: number;
  formUrl: string;
};

type SlotsResponse = {
  slots: Slot[];
  updatedAt: string;
};

type SlotGroup = {
  dateLabel: string;
  weekdayLabel: string;
  slots: Array<Slot & { timeLabel: string }>;
};

type BookingStep = "notice" | "form" | "success";

type BookingForm = {
  name: string;
  phone: string;
  phya: string;
};

type BookingResponse = {
  ok?: boolean;
  message?: string;
};

const EMPTY_BOOKING_FORM: BookingForm = {
  name: "",
  phone: "",
  phya: "",
};

function splitDateTime(dateTime: string) {
  const match = dateTime.trim().match(/^(\d{1,2}\/\d{1,2}(?:\/\d{4})?)(?:\s+(.+))?$/);

  return {
    dateLabel: match?.[1] ?? dateTime,
    timeLabel: match?.[2]?.trim() || "時間待定",
  };
}

function getWeekdayLabel(dateLabel: string) {
  const parts = dateLabel.split("/").map(Number);
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) return "";

  const [day, month, year] = parts;
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("zh-HK", { weekday: "long" }).format(date);
}

function getLessonLabel(className: string) {
  const match = className.match(/第\s*([0-9一二三四五六七八九十]+)\s*([課堂])/);
  return match ? `第${match[1]}${match[2]}` : "背部運動班";
}

function groupSlotsByDate(slots: Slot[]): SlotGroup[] {
  const groups = new Map<string, SlotGroup>();

  slots.forEach((slot) => {
    const { dateLabel, timeLabel } = splitDateTime(slot.dateTime);
    const existing = groups.get(dateLabel);
    const groupedSlot = { ...slot, timeLabel };

    if (existing) {
      existing.slots.push(groupedSlot);
      return;
    }

    groups.set(dateLabel, {
      dateLabel,
      weekdayLabel: getWeekdayLabel(dateLabel),
      slots: [groupedSlot],
    });
  });

  return Array.from(groups.values());
}

function CalendarIcon() {
  return <span aria-hidden="true">日</span>;
}

function PeopleIcon() {
  return <span aria-hidden="true">人</span>;
}

export function BookingClient() {
  const [data, setData] = useState<SlotsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [bookingStep, setBookingStep] = useState<BookingStep>("notice");
  const [bookingForm, setBookingForm] = useState<BookingForm>(EMPTY_BOOKING_FORM);
  const [bookingError, setBookingError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const loadSlots = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/slots", { cache: "no-store" });
      if (!response.ok) throw new Error("Could not load booking slots");
      setData((await response.json()) as SlotsResponse);
    } catch {
      setError("暫時無法取得最新時段，請稍後再試。");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => loadSlots(), 0);
    const interval = window.setInterval(() => loadSlots(true), 15000);
    const handleVisibility = () => {
      if (document.visibilityState === "visible") loadSlots(true);
    };

    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.clearTimeout(initialLoad);
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [loadSlots]);

  useEffect(() => {
    if (!selectedSlot) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !submitting) setSelectedSlot(null);
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [selectedSlot, submitting]);

  const openBooking = (slot: Slot) => {
    setSelectedSlot(slot);
    setBookingStep("notice");
    setBookingForm(EMPTY_BOOKING_FORM);
    setBookingError("");
  };

  const closeBooking = () => {
    if (submitting) return;
    setSelectedSlot(null);
    setBookingError("");
  };

  const submitBooking = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedSlot || submitting) return;

    setSubmitting(true);
    setBookingError("");

    try {
      const response = await fetch("/api/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...bookingForm,
          slot: selectedSlot.dateTime,
        }),
      });
      const result = (await response.json()) as BookingResponse;

      if (!response.ok || !result.ok) {
        setBookingError(result.message || "暫時未能提交預約，請稍後再試。");
        return;
      }

      setBookingStep("success");
      void loadSlots(true);
    } catch {
      setBookingError("暫時未能提交預約，請檢查網絡後再試。");
    } finally {
      setSubmitting(false);
    }
  };

  const updateLabel = data?.updatedAt
    ? new Intl.DateTimeFormat("zh-HK", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(new Date(data.updatedAt))
    : "";
  const slotGroups = groupSlotsByDate(data?.slots ?? []);

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="YCH Clinic 首頁">
          <span className="brand-mark">Y</span>
          <span>
            <strong>YCH Clinic</strong>
            <small>課堂預約</small>
          </span>
        </a>
        <div className="live-status" aria-live="polite">
          <span className="live-dot" />
          即時名額
        </div>
      </header>

      <aside className="sidebar" aria-label="主要導覽">
        <div className="sidebar-item active">
          <span className="sidebar-icon"><CalendarIcon /></span>
          <span>課堂資料</span>
        </div>
        <div className="sidebar-item muted">
          <span className="sidebar-icon"><PeopleIcon /></span>
          <span>預約紀錄</span>
        </div>
      </aside>

      <main id="top" className="main-content">
        <section className="hero">
          <p className="eyebrow">Back Care Programme</p>
          <h1>背部運動班</h1>
          <p className="hero-copy">選擇尚有名額的課堂時段，然後填寫預約表格。</p>
        </section>

        <section className="booking-panel" aria-labelledby="available-heading">
          <div className="panel-heading">
            <div>
              <div className="heading-line">
                <h2 id="available-heading">可預約時段</h2>
                {!loading && !error && <span className="count-pill">{data?.slots.length ?? 0}</span>}
              </div>
              <p>{updateLabel ? `最後更新 ${updateLabel}` : "正在讀取即時名額"}</p>
            </div>
            <button className="refresh-button" onClick={() => loadSlots()} disabled={loading}>
              <span aria-hidden="true">↻</span>
              更新
            </button>
          </div>

          {loading && (
            <div className="slot-card loading-card" aria-label="正在載入時段">
              <div className="skeleton skeleton-title" />
              <div className="skeleton skeleton-line" />
              <div className="skeleton skeleton-button" />
            </div>
          )}

          {!loading && error && (
            <div className="empty-state error-state" role="alert">
              <span className="empty-symbol">!</span>
              <h3>未能載入時段</h3>
              <p>{error}</p>
              <button onClick={() => loadSlots()}>重新載入</button>
            </div>
          )}

          {!loading && !error && slotGroups.length === 0 && (
            <div className="empty-state">
              <span className="empty-symbol">✓</span>
              <h3>暫時未有可預約時段</h3>
              <p>新時段開放後會自動顯示，請稍後再查看。</p>
            </div>
          )}

          {!loading && !error && slotGroups.length > 0 && (
            <div className="availability-legend" aria-label="名額狀態說明">
              <span><i className="legend-dot available" />可預約</span>
              <span><i className="legend-dot last-place" />尚餘 1 位</span>
              <span><i className="legend-dot full" />已滿</span>
            </div>
          )}

          {!loading && !error && slotGroups.map((group) => {
            const availableCount = group.slots.filter((slot) => slot.spacesRemaining > 0).length;

            return (
              <section className="day-card" key={group.dateLabel}>
                <div className="day-heading">
                  <div className="day-title">
                    <div className="date-icon"><CalendarIcon /></div>
                    <h3>
                      {group.dateLabel}
                      {group.weekdayLabel && <span>（{group.weekdayLabel}）</span>}
                    </h3>
                  </div>
                  <p><strong>{availableCount}</strong> / {group.slots.length} 個時段可預約</p>
                </div>

                <div className="day-slots">
                  {group.slots.map((slot) => {
                    const isFull = slot.spacesRemaining <= 0;
                    const isLastPlace = slot.spacesRemaining === 1;
                    const statusClass = isFull ? "full" : isLastPlace ? "last-place" : "available";
                    const statusLabel = isFull ? "已滿" : `尚餘 ${slot.spacesRemaining} 位`;
                    const filled = slot.maxCapacity > 0
                      ? Math.min(100, Math.max(0, (slot.currentlyBooked / slot.maxCapacity) * 100))
                      : 0;

                    return (
                      <article
                        className={`day-slot ${isFull ? "is-full" : ""} ${isLastPlace ? "is-last-place" : ""}`}
                        key={slot.id}
                      >
                        <div className="slot-primary">
                          <span className="lesson-badge">{getLessonLabel(slot.className)}</span>
                          <div>
                            <strong>{slot.timeLabel}</strong>
                            <span>背部運動班</span>
                          </div>
                        </div>

                        <div className="compact-capacity">
                          <div className="compact-capacity-line">
                            <span className={`capacity-status ${statusClass}`}>
                              <i />{statusLabel}
                            </span>
                            <strong>{slot.spacesRemaining}<small> / {slot.maxCapacity}</small></strong>
                          </div>
                          <div className="progress-track" aria-hidden="true">
                            <span style={{ width: `${filled}%` }} />
                          </div>
                          <p>已有 {slot.currentlyBooked} 人預約</p>
                        </div>

                        <button
                          className="book-button compact-book-button"
                          type="button"
                          disabled={isFull}
                          aria-label={isFull
                            ? `${group.dateLabel} ${slot.timeLabel} ${getLessonLabel(slot.className)}已滿`
                            : `申請${group.dateLabel} ${slot.timeLabel} ${getLessonLabel(slot.className)}`}
                          onClick={() => openBooking(slot)}
                        >
                          {isFull ? "已滿" : "申請此時段"}
                          {!isFull && <span aria-hidden="true">→</span>}
                        </button>
                      </article>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </section>

        <footer>
          <span className="privacy-dot" />
          名額資料每 15 秒自動更新
        </footer>
      </main>

      {selectedSlot && (
        <div className="notice-backdrop" role="presentation" onMouseDown={closeBooking}>
          <section
            className={`notice-dialog ${bookingStep === "form" ? "booking-form-dialog" : ""}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="booking-notice-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            {bookingStep === "notice" && (
              <>
                <div className="notice-icon" aria-hidden="true">!</div>
                <h2 id="booking-notice-title">預約申請提示</h2>
                <p className="notice-lead">此申請並不代表預約已確認。</p>
                <p>
                  每位病人在已預約課堂完結前，只可保留一個課堂申請。
                </p>
                <p>
                  申請成功後，您將透過 <strong>HA Go</strong> 收到正式預約通知，請留意及查閱 HA Go。
                </p>
                <p>如未收到 HA Go 通知，請勿視作預約成功。</p>
                <div className="notice-actions">
                  <button className="notice-back" type="button" onClick={closeBooking}>
                    返回
                  </button>
                  <button
                    className="notice-continue"
                    type="button"
                    autoFocus
                    onClick={() => setBookingStep("form")}
                  >
                    我明白並繼續
                  </button>
                </div>
              </>
            )}

            {bookingStep === "form" && (
              <form onSubmit={submitBooking}>
                <div className="notice-icon form-icon" aria-hidden="true">人</div>
                <h2 id="booking-notice-title">填寫預約資料</h2>
                <div className="selected-session" aria-label="已選擇的課堂">
                  <span>預約課堂</span>
                  <strong>{selectedSlot.dateTime}</strong>
                </div>

                <div className="booking-fields">
                  <label>
                    <span>姓名</span>
                    <input
                      name="name"
                      autoComplete="name"
                      value={bookingForm.name}
                      onChange={(event) => setBookingForm((current) => ({ ...current, name: event.target.value }))}
                      maxLength={80}
                      required
                      autoFocus
                    />
                  </label>
                  <label>
                    <span>聯絡電話</span>
                    <input
                      name="phone"
                      type="tel"
                      inputMode="numeric"
                      autoComplete="tel"
                      value={bookingForm.phone}
                      onChange={(event) => setBookingForm((current) => ({ ...current, phone: event.target.value }))}
                      placeholder="8 位數字"
                      maxLength={30}
                      required
                    />
                  </label>
                  <label>
                    <span>PHYA 號碼</span>
                    <input
                      name="phya"
                      autoCapitalize="characters"
                      value={bookingForm.phya}
                      onChange={(event) => setBookingForm((current) => ({ ...current, phya: event.target.value }))}
                      placeholder="例如：PHYA26175957"
                      maxLength={30}
                      required
                    />
                  </label>
                </div>

                {bookingError && <div className="booking-error" role="alert">{bookingError}</div>}

                <p className="form-rule-note">系統會檢查您是否已有尚未完結的課堂。</p>
                <div className="notice-actions">
                  <button className="notice-back" type="button" onClick={() => setBookingStep("notice")} disabled={submitting}>
                    返回
                  </button>
                  <button className="notice-continue" type="submit" disabled={submitting}>
                    {submitting ? "正在檢查…" : "提交申請"}
                  </button>
                </div>
              </form>
            )}

            {bookingStep === "success" && (
              <>
                <div className="notice-icon success-icon" aria-hidden="true">✓</div>
                <h2 id="booking-notice-title">已收到您的申請</h2>
                <p className="notice-lead">您的資料已成功提交。</p>
                <p>
                  此申請並不代表預約已確認。申請成功後，您將透過 <strong>HA Go</strong> 收到正式預約通知。
                </p>
                <p>如未收到 HA Go 通知，請勿視作預約成功。</p>
                <div className="notice-actions">
                  <button className="notice-continue" type="button" onClick={closeBooking} autoFocus>
                    完成
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
