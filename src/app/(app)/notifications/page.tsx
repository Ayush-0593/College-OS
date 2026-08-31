"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import { apiFetch, classNames } from "@/components/client-utils";
import { kindLabel } from "@/lib/notifications";
import { relativeTime } from "@/lib/dates";

// §14 — Full notifications feed.
// Filter chips (All / Unread), mark-all-read action, deep-link to the source page.

type Filter = "all" | "unread";
const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "unread", label: "Unread" },
];

interface NotificationRow {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  href: string | null;
  read: boolean;
  createdAt: string;
}

export default function NotificationsPage() {
  const router = useRouter();
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [unreadCount, setUnreadCount] = useState(0);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const qs = filter === "unread" ? "?unread=true&limit=100" : "?limit=100";
      const data = await apiFetch<{ notifications: NotificationRow[]; unreadCount: number }>(
        `/api/notifications${qs}`
      );
      setItems(data.notifications);
      setUnreadCount(data.unreadCount);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  async function markAll() {
    try {
      await apiFetch("/api/notifications/mark-read", {
        method: "POST",
        body: JSON.stringify({ all: true }),
      });
      setItems((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not mark read.");
    }
  }

  async function markOne(id: string) {
    try {
      await apiFetch("/api/notifications/mark-read", {
        method: "POST",
        body: JSON.stringify({ ids: [id] }),
      });
      setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch {
      // ignore
    }
  }

  function handleRowClick(n: NotificationRow) {
    if (!n.read) markOne(n.id);
    if (n.href) router.push(n.href);
  }

  return (
    <div>
      <PageHeader
        title="Notifications"
        subtitle="Reminders about upcoming classes, due assignments, and attendance."
        action={
          <button
            className="btn-ghost"
            onClick={markAll}
            disabled={loading || unreadCount === 0}
          >
            Mark all read
          </button>
        }
      />

      {/* Filter chips */}
      <div className="flex gap-2 mb-5 overflow-x-auto scrollbar-thin -mx-1 px-1">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={classNames(
              "rounded-full px-3.5 py-1.5 text-xs font-medium border transition-colors whitespace-nowrap",
              filter === f.key
                ? "bg-brand-600 text-white border-brand-600"
                : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-brand-300"
            )}
          >
            {f.label}
            {f.key === "unread" && unreadCount > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-semibold">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-900/30 px-4 py-2 text-sm text-rose-700 dark:text-rose-200">
          {error}
        </div>
      )}

      {/* Feed */}
      {loading ? (
        <SkeletonList />
      ) : items.length === 0 ? (
        <EmptyState filter={filter} />
      ) : (
        <ul className="space-y-2">
          {items.map((n) => (
            <li key={n.id}>
              <NotificationCard
                item={n}
                onClick={() => handleRowClick(n)}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function NotificationCard({
  item,
  onClick,
}: {
  item: NotificationRow;
  onClick: () => void;
}) {
  // Prisma's `kind` column is stored as `String`, so the row type is widened to
  // plain `string`. Narrow it here for the tone lookup + label below.
  const kind = item.kind as
    | "class_soon"
    | "due_tomorrow"
    | "attendance_low"
    | "exam_soon"
    | "notice_new"
    | "morning_digest"
    | "evening_digest";
  const tone =
    kind === "class_soon"
      ? "bg-brand-100 dark:bg-brand-900/40 text-brand-700 dark:text-brand-200"
      : kind === "due_tomorrow"
      ? "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-200"
      : kind === "exam_soon"
      ? "bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-200"
      : kind === "notice_new"
      ? "bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-200"
      : kind === "morning_digest"
      ? "bg-cyan-100 dark:bg-cyan-900/40 text-cyan-700 dark:text-cyan-200"
      : kind === "evening_digest"
      ? "bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-200"
      : "bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-200";
  return (
    <button
      type="button"
      onClick={onClick}
      className={classNames(
        "w-full card p-4 text-left flex items-start gap-3 hover:shadow-soft transition-shadow",
        !item.read && "ring-1 ring-brand-200 dark:ring-brand-800"
      )}
    >
      <span
        className={classNames(
          "shrink-0 inline-flex items-center justify-center h-9 w-9 rounded-xl text-[11px] font-semibold uppercase",
          tone
        )}
        aria-hidden
      >
        {kindLabel(kind).slice(0, 2)}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p
            className={classNames(
              "text-sm leading-snug",
              !item.read ? "font-semibold" : "font-medium",
              item.read && "text-slate-500 dark:text-slate-400"
            )}
          >
            {item.title}
          </p>
          {!item.read && (
            <span
              className="h-2 w-2 rounded-full bg-rose-500 shrink-0"
              aria-label="Unread"
            />
          )}
        </div>
        {item.body && (
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {item.body}
          </p>
        )}
        <p className="text-[11px] text-slate-400 mt-1.5">
          {relativeTime(new Date(item.createdAt))}
          {item.href && <> · Tap to open</>}
        </p>
      </div>
    </button>
  );
}

function EmptyState({ filter }: { filter: Filter }) {
  return (
    <div className="card p-10 text-center">
      <div className="inline-grid place-items-center h-14 w-14 rounded-2xl bg-brand-100 dark:bg-brand-900/40 text-brand-700 dark:text-brand-200 text-2xl mb-4">
        🔔
      </div>
      <h2 className="text-lg font-semibold tracking-tight">
        {filter === "unread" ? "No unread notifications" : "All caught up 🎉"}
      </h2>
      <p className="text-sm text-slate-500 mt-1 max-w-sm mx-auto">
        Reminders about upcoming classes, due assignments, and attendance appear
        here.
      </p>
    </div>
  );
}

function SkeletonList() {
  return (
    <ul className="space-y-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <li key={i} className="card p-4 animate-pulse">
          <div className="flex items-start gap-3">
            <div className="h-9 w-9 rounded-xl bg-slate-200 dark:bg-slate-800" />
            <div className="flex-1 space-y-2">
              <div className="h-3.5 w-2/3 rounded bg-slate-200 dark:bg-slate-800" />
              <div className="h-3 w-1/2 rounded bg-slate-200 dark:bg-slate-800" />
              <div className="h-3 w-1/3 rounded bg-slate-200 dark:bg-slate-800" />
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
