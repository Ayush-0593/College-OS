// §22 — Server-rendered agenda view. Mirrors the API feed for the next 30
// days but in a more glanceable "by day" layout. Includes the SubscribeCard
// so the user can grab the webcal:// URL right from the page.

import { headers } from "next/headers";
import { requireUser } from "@/lib/requireUser";
import { buildAgenda, type AgendaItem } from "@/lib/calendarView";
import { SubscribeCard } from "@/components/SubscribeCard";
import PageHeader from "@/components/PageHeader";
import { dateKey, format12, formatDateLong } from "@/lib/dates";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { ctx } = auth;

  const items = await buildAgenda(ctx.userId, { fromDays: 0, toDays: 30 });

  // The webcal:// URL is the same /api/calendar.ics path with a different
  // scheme. We display both so the user can pick whichever their calendar
  // app expects. We resolve the host from headers (works in dev and behind
  // a reverse proxy) and fall back to localhost for static export / previews.
  const h = headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "http";
  const httpsUrl = `${proto}://${host}/api/calendar.ics`;
  const webcalUrl = httpsUrl.replace(/^https?:/, "webcal:");

  // Group by local date. We use a Map keyed by yyyy-mm-dd so iteration
  // order is whatever insertion order; we then sort the keys before render.
  const groups = new Map<string, AgendaItem[]>();
  for (const it of items) {
    const k = dateKey(it.date);
    const arr = groups.get(k);
    if (arr) arr.push(it);
    else groups.set(k, [it]);
  }
  const sortedKeys = [...groups.keys()].sort();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Calendar"
        subtitle="Your schedule, in one place"
      />

      <SubscribeCard webcalUrl={webcalUrl} httpsUrl={httpsUrl} />

      {sortedKeys.length === 0 ? (
        <p className="text-sm text-slate-400">Nothing in the next 30 days.</p>
      ) : (
        <div className="space-y-5">
          {sortedKeys.map((k) => {
            const dayItems = groups.get(k) ?? [];
            return (
              <section key={k}>
                <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                  {formatDateLong(dayItems[0].date)}
                </h2>
                <ul className="mt-2 divide-y divide-slate-100 dark:divide-slate-800 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                  {dayItems.map((it, idx) => (
                    <AgendaRow key={`${it.source}-${it._sourceId ?? "?"}-${idx}`} item={it} />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AgendaRow({ item }: { item: AgendaItem }) {
  const time = item.isAllDay
    ? "All day"
    : format12(
        item.start.getHours().toString().padStart(2, "0") +
          ":" +
          item.start.getMinutes().toString().padStart(2, "0")
      );
  return (
    <li className="px-4 py-3 flex items-start gap-3">
      <span
        className="mt-1 h-2.5 w-2.5 rounded-full shrink-0"
        style={{ backgroundColor: item.color ?? "#94a3b8" }}
        aria-hidden
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-slate-900 dark:text-slate-100 truncate">
            {item.title}
          </span>
          <SourceBadge source={item.source} label={item.sourceLabel} />
        </div>
        {item.subtitle && (
          <p className="text-sm text-slate-500 dark:text-slate-400 truncate">
            {item.subtitle}
          </p>
        )}
      </div>
      <time className="text-sm text-slate-500 dark:text-slate-400 shrink-0 tabular-nums">
        {time}
      </time>
    </li>
  );
}

function SourceBadge({
  source,
  label,
}: {
  source: "timetable" | "assignment" | "exam";
  label: string;
}) {
  const colorBySource: Record<string, string> = {
    timetable:
      "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300",
    assignment:
      "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-200",
    exam: "bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-200",
  };
  return (
    <span className={`badge ${colorBySource[source]}`}>{label}</span>
  );
}
