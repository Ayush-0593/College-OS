"use client";

// §14 — Smart Reminders bell + dropdown.
// Lives in the sidebar header (desktop) and a thin top bar (mobile).
// Polls /api/notifications/unread-count every 30s while the tab is visible.

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, classNames } from "./client-utils";
import { kindLabel } from "@/lib/notifications";
import { relativeTime } from "@/lib/dates";

interface NotificationRow {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  href: string | null;
  read: boolean;
  createdAt: string;
}

interface BellProps {
  /** Layout variant: "header" (in the sidebar row) or "mobile" (thin top bar). */
  variant?: "header" | "mobile";
}

export default function NotificationBell({ variant = "header" }: BellProps) {
  const router = useRouter();
  const [unread, setUnread] = useState<number>(0);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // Poll unread count every 30s while visible.
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    async function tick() {
      try {
        const res = await apiFetch<{ count: number }>("/api/notifications/unread-count");
        setUnread(res.count);
      } catch {
        // ignore — keep last known value
      }
    }
    function start() {
      tick();
      timer = setInterval(tick, 30_000);
    }
    function stop() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    }
    function onVisibility() {
      if (document.visibilityState === "visible") {
        start();
      } else {
        stop();
      }
    }
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  // Close on outside click.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!open) return;
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  const refreshUnread = useCallback(async () => {
    try {
      const res = await apiFetch<{ count: number }>("/api/notifications/unread-count");
      setUnread(res.count);
    } catch {
      // ignore
    }
  }, []);

  async function openPanel() {
    setOpen((v) => !v);
    if (!open) {
      setLoading(true);
      try {
        const res = await apiFetch<{ notifications: NotificationRow[] }>(
          "/api/notifications?limit=5"
        );
        setItems(res.notifications);
      } catch {
        setItems([]);
      } finally {
        setLoading(false);
      }
    }
  }

  async function markAll() {
    try {
      await apiFetch("/api/notifications/mark-read", {
        method: "POST",
        body: JSON.stringify({ all: true }),
      });
      setItems((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnread(0);
    } catch {
      // ignore
    }
  }

  async function markOne(id: string) {
    try {
      await apiFetch("/api/notifications/mark-read", {
        method: "POST",
        body: JSON.stringify({ ids: [id] }),
      });
      setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
      setUnread((c) => Math.max(0, c - 1));
    } catch {
      // ignore
    }
  }

  function handleRowClick(n: NotificationRow) {
    if (!n.read) markOne(n.id);
    if (n.href) {
      setOpen(false);
      router.push(n.href);
    }
  }

  const badge = unread > 99 ? "99+" : String(unread);

  return (
    <div ref={wrapRef} className={classNames("relative", variant === "mobile" && "ml-auto")}>
      <button
        type="button"
        onClick={openPanel}
        aria-label={`Notifications${unread > 0 ? ` (${unread} unread)` : ""}`}
        className={classNames(
          "relative grid place-items-center rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors",
          variant === "header" ? "h-10 w-10" : "h-9 w-9"
        )}
      >
        <BellIcon className="h-5 w-5" />
        {unread > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-semibold leading-[18px] text-center"
            aria-hidden
          >
            {badge}
          </span>
        )}
      </button>

      {open && (
        <div
          className={classNames(
            // Desktop (header variant): bell sits at the right edge of the
            // *left* sidebar, so anchoring the panel to the bell's right edge
            // (`right-0`) would push it leftward off the sidebar. Anchor to
            // the bell's left edge so the panel grows rightward into the
            // main content area instead.
            //
            // Mobile (mobile variant): bell is at the right edge of a narrow
            // top bar, so anchor to the right edge of the bell and cap width
            // so the panel doesn't overflow the viewport.
            "absolute z-50 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl overflow-hidden",
            variant === "header"
              ? "left-full ml-2 mt-2 w-80 max-w-[calc(100vw-1rem)]"
              : "right-2 top-12 w-[calc(100vw-1rem)] max-w-80 sm:w-80"
          )}
          role="dialog"
          aria-label="Notifications"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-800">
            <p className="font-semibold text-sm">Notifications</p>
            <button
              type="button"
              onClick={markAll}
              disabled={unread === 0}
              className="text-xs font-medium text-brand-600 dark:text-brand-300 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Mark all read
            </button>
          </div>

          <div className="max-h-96 overflow-y-auto">
            {loading ? (
              <p className="p-4 text-sm text-slate-400">Loading…</p>
            ) : items.length === 0 ? (
              <p className="p-6 text-sm text-slate-400 text-center">
                All caught up 🎉
              </p>
            ) : (
              <ul>
                {items.map((n) => {
                  const inner = (
                    <div className="flex items-start gap-3 px-4 py-3">
                      <KindBadge kind={n.kind} />
                      <div className="min-w-0 flex-1">
                        <p
                          className={classNames(
                            "text-sm leading-snug",
                            !n.read && "font-semibold",
                            n.read && "text-slate-500 dark:text-slate-400"
                          )}
                        >
                          {n.title}
                        </p>
                        {n.body && (
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                            {n.body}
                          </p>
                        )}
                        <p className="text-[11px] text-slate-400 mt-1">
                          {relativeTime(new Date(n.createdAt))}
                        </p>
                      </div>
                      {!n.read && (
                        <span
                          className="mt-1 h-2 w-2 rounded-full bg-rose-500 shrink-0"
                          aria-label="Unread"
                        />
                      )}
                    </div>
                  );
                  return (
                    <li
                      key={n.id}
                      className={classNames(
                        "border-b border-slate-100 dark:border-slate-800 last:border-b-0",
                        !n.read && "bg-brand-50/40 dark:bg-brand-900/10"
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => handleRowClick(n)}
                        className="block w-full text-left hover:bg-slate-50 dark:hover:bg-slate-800/50"
                      >
                        {inner}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="border-t border-slate-200 dark:border-slate-800 px-4 py-2.5">
            <Link
              href="/notifications"
              onClick={() => setOpen(false)}
              className="block text-center text-sm font-medium text-brand-600 dark:text-brand-300 hover:underline"
            >
              See all
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function KindBadge({ kind }: { kind: NotificationRow["kind"] }) {
  // Prisma returns the kind as plain `string`; narrow to the union for the
  // kindLabel switch + tone branches.
  const k = kind as
    | "class_soon"
    | "due_tomorrow"
    | "attendance_low"
    | "exam_soon"
    | "notice_new"
    | "morning_digest"
    | "evening_digest";
  const label = kindLabel(k);
  const tone =
    k === "class_soon"
      ? "bg-brand-100 dark:bg-brand-900/40 text-brand-700 dark:text-brand-200"
      : k === "due_tomorrow"
      ? "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-200"
      : k === "exam_soon"
      ? "bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-200"
      : k === "notice_new"
      ? "bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-200"
      : k === "morning_digest"
      ? "bg-cyan-100 dark:bg-cyan-900/40 text-cyan-700 dark:text-cyan-200"
      : k === "evening_digest"
      ? "bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-200"
      : "bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-200";
  return (
    <span
      className={classNames(
        "shrink-0 inline-flex items-center justify-center h-7 w-7 rounded-lg text-[10px] font-semibold uppercase",
        tone
      )}
      aria-hidden
    >
      {label.slice(0, 2)}
    </span>
  );
}

function BellIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path
        d="M6 9a6 6 0 1 1 12 0c0 4 1.5 5.5 2 6.5H4c.5-1 2-2.5 2-6.5Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M10 19a2 2 0 0 0 4 0" strokeLinecap="round" />
    </svg>
  );
}
