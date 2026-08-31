import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import Sidebar from "@/components/Sidebar";
import MobileNav from "@/components/MobileNav";
import NotificationBell from "@/components/NotificationBell";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <div className="flex min-h-screen bg-slate-50 dark:bg-slate-950">
      <Sidebar name={user.name} />
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile-only top bar with the notification bell.
            Desktop already has the bell in the sidebar header, so hide on md+. */}
        <div className="md:hidden sticky top-0 z-30 flex items-center gap-2 px-4 h-12 bg-white/95 dark:bg-slate-900/95 backdrop-blur border-b border-slate-200 dark:border-slate-800">
          <span className="font-semibold text-sm">College OS</span>
          <NotificationBell variant="mobile" />
        </div>
        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6 pb-24 md:pb-6 max-w-5xl w-full mx-auto scrollbar-thin">
          {children}
        </main>
      </div>
      <MobileNav />
    </div>
  );
}
