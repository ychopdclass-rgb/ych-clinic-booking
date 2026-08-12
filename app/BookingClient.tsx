"use client";

import { useCallback, useEffect, useState } from "react";

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
  const [pendingFormUrl, setPendingFormUrl] = useState("");

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
    if (!pendingFormUrl) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPendingFormUrl("");
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [pendingFormUrl]);

  const updateLabel = data?.updatedAt
    ? new Intl.DateTimeFormat("zh-HK", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(new Date(data.updatedAt))
    : "";

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
                {!loading && !error && (
                  <span className="count-pill">{data?.slots.length ?? 0}</span>
                )}
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

          {!loading && !error && data?.slots.length === 0 && (
            <div className="empty-state">
              <span className="empty-symbol">✓</span>
              <h3>暫時未有可預約時段</h3>
              <p>新時段開放後會自動顯示，請稍後再查看。</p>
            </div>
          )}

          {!loading && !error && data?.slots.map((slot) => {
            const filled = slot.maxCapacity > 0
              ? Math.min(100, Math.max(0, (slot.currentlyBooked / slot.maxCapacity) * 100))
              : 0;

            return (
              <article className="slot-card" key={slot.id}>
                <div className="slot-topline">
                  <div>
                    <p className="slot-kicker">背部運動班</p>
                    <h3>{slot.className || "背部運動班"}</h3>
                  </div>
                  <span className="available-badge">
                    <span /> 尚有名額
                  </span>
                </div>

                <div className="slot-body">
                  <div className="slot-date">
                    <div className="date-icon"><CalendarIcon /></div>
                    <div>
                      <span>日期及時間</span>
                      <strong>{slot.dateTime}</strong>
                    </div>
                  </div>

                  <div className="capacity-block">
                    <div className="capacity-label">
                      <span>剩餘名額</span>
                      <strong>{slot.spacesRemaining}<small> / {slot.maxCapacity}</small></strong>
                    </div>
                    <div className="progress-track" aria-hidden="true">
                      <span style={{ width: `${filled}%` }} />
                    </div>
                    <p>已有 {slot.currentlyBooked} 人預約</p>
                  </div>

                  <button
                    className="book-button"
                    type="button"
                    onClick={() => setPendingFormUrl(slot.formUrl)}
                  >
                    申請此時段
                    <span aria-hidden="true">→</span>
                  </button>
                </div>
              </article>
            );
          })}
        </section>

        <footer>
          <span className="privacy-dot" />
          名額資料每 15 秒自動更新
        </footer>
      </main>

      {pendingFormUrl && (
        <div className="notice-backdrop" role="presentation" onMouseDown={() => setPendingFormUrl("")}>
          <section
            className="notice-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="booking-notice-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="notice-icon" aria-hidden="true">!</div>
            <h2 id="booking-notice-title">預約申請提示</h2>
            <p className="notice-lead">此申請並不代表預約已確認。</p>
            <p>
              申請成功後，您將透過 <strong>HA Go</strong> 收到正式預約通知，請留意及查閱 HA Go。
            </p>
            <p>如未收到 HA Go 通知，請勿視作預約成功。</p>
            <div className="notice-actions">
              <button className="notice-back" type="button" onClick={() => setPendingFormUrl("")}>
                返回
              </button>
              <button
                className="notice-continue"
                type="button"
                autoFocus
                onClick={() => window.location.assign(pendingFormUrl)}
              >
                我明白並繼續
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
