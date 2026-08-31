import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";

export default async function Home() {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");

  return (
    <main className="min-h-screen bg-gradient-to-br from-brand-50 via-white to-slate-100 dark:from-slate-950 dark:via-slate-950 dark:to-slate-900">
      <div className="max-w-5xl mx-auto px-6 py-20">
        <div className="flex items-center gap-2 mb-10 justify-center">
          <span className="grid place-items-center h-10 w-10 rounded-xl bg-brand-600 text-white font-bold">
            C
          </span>
          <span className="font-semibold text-xl tracking-tight">College OS</span>
        </div>

        <div className="text-center max-w-2xl mx-auto">
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight leading-tight">
            Everything you need to survive college, in one app.
          </h1>
          <p className="mt-5 text-lg text-slate-500 dark:text-slate-400">
            Timetable, assignments, exams, attendance, and notices — organized
            into a single dashboard that tells you exactly what to do next.
          </p>
          <div className="mt-8 flex gap-3 justify-center">
            <Link href="/register" className="btn-primary px-6 py-3 text-base">
              Get started
            </Link>
            <Link href="/login" className="btn-ghost px-6 py-3 text-base">
              Try the demo
            </Link>
          </div>
        </div>

        <div className="mt-16 grid grid-cols-2 sm:grid-cols-3 gap-4 text-center">
          {[
            ["Dashboard", "What to do right now"],
            ["Timetable", "Today's classes & rooms"],
            ["Assignments", "Deadlines that matter"],
            ["Exams", "Upcoming & prep %"],
            ["Attendance", "How many you can miss"],
            ["Notices", "No more WhatsApp chaos"],
          ].map(([t, d]) => (
            <div key={t} className="card p-5">
              <p className="font-semibold">{t}</p>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{d}</p>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
