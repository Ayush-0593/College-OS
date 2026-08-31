"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { apiFetch, classNames } from "./client-utils";
import NotificationBell from "./NotificationBell";

// §25 — strict 5-item sidebar: Home | Schedule | Tasks | AI | Me.
// Attendance and Notices remain accessible from inside Dashboard cards,
// but they are not top-level navigation.
const NAV = [
  { href: "/dashboard", label: "Home", icon: HomeIcon },
  { href: "/timetable", label: "Schedule", icon: CalendarIcon },
  { href: "/assignments", label: "Tasks", icon: TaskIcon },
  { href: "/ai", label: "AI", icon: SparklesIcon },
  { href: "/profile", label: "Me", icon: UserIcon },
];

export default function Sidebar({ name }: { name?: string | null }) {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await apiFetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const firstName = name?.split(" ")[0] || "Student";

  return (
    <aside className="hidden md:flex md:flex-col w-64 shrink-0 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
      <div className="flex items-center mb-6">
        <Link href="/dashboard" className="flex items-center gap-2 px-2">
          <span className="grid place-items-center h-9 w-9 rounded-xl bg-brand-600 text-white font-bold">
            C
          </span>
          <span className="font-semibold text-lg tracking-tight">College OS</span>
        </Link>
        <div className="ml-auto pr-1">
          <NotificationBell variant="header" />
        </div>
      </div>

      <nav className="flex flex-col gap-1 flex-1">
        {NAV.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={classNames(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "bg-brand-50 dark:bg-brand-900/40 text-brand-700 dark:text-brand-200"
                  : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              )}
            >
              <Icon className="h-5 w-5" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-4 border-t border-slate-200 dark:border-slate-800 pt-4">
        <div className="flex items-center gap-3 px-2 mb-3">
          <span className="grid place-items-center h-9 w-9 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-200 font-medium">
            {firstName.charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{firstName}</p>
            <p className="text-xs text-slate-400">Student</p>
          </div>
        </div>
        <button onClick={logout} className="btn-ghost w-full justify-start">
          Log out
        </button>
      </div>
    </aside>
  );
}

function HomeIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M3 10.5 12 3l9 7.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 9.5V21h14V9.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function CalendarIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <rect x="3" y="4.5" width="18" height="16" rx="2" />
      <path d="M3 9h18M8 3v3M16 3v3" strokeLinecap="round" />
    </svg>
  );
}
function TaskIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M4 6h16M4 12h16M4 18h10" strokeLinecap="round" />
      <path d="M19 16.5 20.5 18 23 15.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function SparklesIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4" strokeLinecap="round" />
      <path d="m6 6 2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6" strokeLinecap="round" />
    </svg>
  );
}
function UserIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c0-3.5 3-6 7-6s7 2.5 7 6" strokeLinecap="round" />
    </svg>
  );
}
