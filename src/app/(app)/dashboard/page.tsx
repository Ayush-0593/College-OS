import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/session";
import { buildDashboard } from "@/lib/dashboard";
import {
  DAY_NAMES,
  MONTH_NAMES,
  format12,
  humanizeMinutes,
  minutesUntil,
  relativeTime,
} from "@/lib/dates";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const data = await buildDashboard(user.id);
  const now = new Date();
  const greeting =
    now.getHours() < 12 ? "Good morning" : now.getHours() < 17 ? "Good afternoon" : "Good evening";
  const firstName = user.name.split(" ")[0];

  return (
    <div className="space-y-6">
      {/* Greeting */}
      <div>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {DAY_NAMES[data.today.label]}, {now.getDate()} {MONTH_NAMES[now.getMonth()]}
        </p>
        <h1 className="text-2xl font-semibold tracking-tight mt-1">
          {greeting}, {firstName} 👋
        </h1>
      </div>

      {/* Next class hero */}
      <div className="card p-6 bg-gradient-to-br from-brand-600 to-brand-500 text-white border-0 shadow-soft">
        {data.today.nextClass ? (
          <>
            <p className="text-xs uppercase tracking-wider text-white/70">Next class</p>
            <p className="text-2xl font-semibold mt-1">{data.today.nextClass.title}</p>
            <p className="text-white/90 mt-1">
              {format12(data.today.nextClass.start)}
              {data.today.nextClass.room ? ` · Room ${data.today.nextClass.room}` : ""}
            </p>
            <p className="text-sm text-white/80 mt-3">
              {data.today.nextClass.start ? `Starts in ${humanizeMinutes(minutesUntil(data.today.nextClass.start))}` : ""}
            </p>
          </>
        ) : (
          <>
            <p className="text-xs uppercase tracking-wider text-white/70">No more classes</p>
            <p className="text-2xl font-semibold mt-1">You're done for now 🎉</p>
            <p className="text-white/90 mt-1">Enjoy your free time or catch up on tasks.</p>
          </>
        )}
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <StatCard label="Today's classes" value={String(data.today.classes.filter((c) => c.type !== "break").length)} href="/timetable" />
        <StatCard
          label="Deadlines today"
          value={String(data.today.deadlinesToday)}
          href="/assignments"
          alert={data.today.deadlinesToday > 0}
        />
        <StatCard
          label="Avg attendance"
          value={data.attendance.avg !== null ? `${data.attendance.avg}%` : "—"}
          href="/attendance"
        />
        <StatCard
          label="New notices"
          value={String(data.notices.length)}
          href="/notices"
          alert={data.notices.length > 0}
        />
        <StatCard
          label="Documents"
          value={String(data.counts.documents)}
          href="/documents"
        />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Today's schedule */}
        <section className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Today</h2>
            <Link href="/timetable" className="text-sm text-brand-600">View all</Link>
          </div>
          {data.today.classes.length === 0 ? (
            <p className="text-sm text-slate-400">No classes scheduled today.</p>
          ) : (
            <ul className="space-y-2">
              {data.today.classes.map((c) => (
                <li key={c.id} className="flex items-center gap-3">
                  <span className="text-xs font-medium text-slate-500 w-12 shrink-0">
                    {format12(c.start)}
                  </span>
                  <span
                    className="h-9 w-1.5 rounded-full shrink-0"
                    style={{ backgroundColor: c.color || "#cbd5e1" }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{c.title}</p>
                    {c.room && <p className="text-xs text-slate-400">Room {c.room}</p>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Deadlines */}
        <section className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Upcoming deadlines</h2>
            <Link href="/assignments" className="text-sm text-brand-600">View all</Link>
          </div>
          {data.today.deadlines.length === 0 ? (
            <p className="text-sm text-slate-400">No pending deadlines. 🎉</p>
          ) : (
            <ul className="space-y-2">
              {data.today.deadlines.map((d) => (
                <li key={d.id} className="flex items-center gap-3">
                  <span
                    className={`badge shrink-0 ${
                      d.priority === "high"
                        ? "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300"
                        : d.priority === "low"
                        ? "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                        : "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                    }`}
                  >
                    {d.daysLeft <= 0 ? "Today" : `${d.daysLeft}d`}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{d.title}</p>
                    {d.subject && <p className="text-xs text-slate-400">{d.subject}</p>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Exams */}
        <section className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Upcoming exams</h2>
            <Link href="/exams" className="text-sm text-brand-600">View all</Link>
          </div>
          {data.upcomingExams.length === 0 ? (
            <p className="text-sm text-slate-400">No exams scheduled.</p>
          ) : (
            <ul className="space-y-3">
              {data.upcomingExams.map((e) => (
                <li key={e.id} className="flex items-center gap-3">
                  <span
                    className="h-10 w-1.5 rounded-full shrink-0"
                    style={{ backgroundColor: e.color || "#cbd5e1" }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{e.title}</p>
                    <p className="text-xs text-slate-400">
                      {e.daysLeft <= 0 ? "Today" : `In ${e.daysLeft} day${e.daysLeft > 1 ? "s" : ""}`}
                      {e.time ? ` · ${e.time}` : ""}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold">{e.prepPercent}%</p>
                    <p className="text-[10px] text-slate-400">prep</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Notices */}
        <section className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Latest notices</h2>
            <Link href="/notices" className="text-sm text-brand-600">View all</Link>
          </div>
          {data.notices.length === 0 ? (
            <p className="text-sm text-slate-400">No new notices.</p>
          ) : (
            <ul className="space-y-3">
              {data.notices.map((n) => (
                <li key={n.id} className="flex items-start gap-3">
                  <span className="badge bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300 shrink-0 mt-0.5">
                    {n.category}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{n.title}</p>
                    <p className="text-xs text-slate-400">{relativeTime(n.createdAt)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  href,
  alert,
}: {
  label: string;
  value: string;
  href: string;
  alert?: boolean;
}) {
  return (
    <Link href={href} className="card p-4 hover:shadow-soft transition-shadow">
      <p className="text-2xl font-semibold">{value}</p>
      <p className={`text-xs mt-1 ${alert ? "text-rose-500 font-medium" : "text-slate-500 dark:text-slate-400"}`}>
        {label}
      </p>
    </Link>
  );
}
