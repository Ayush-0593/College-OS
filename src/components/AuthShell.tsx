"use client";

import { ReactNode } from "react";

export function AuthShell({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen grid place-items-center px-4 bg-gradient-to-br from-brand-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center gap-2 mb-8">
          <span className="grid place-items-center h-10 w-10 rounded-xl bg-brand-600 text-white font-bold text-lg">
            C
          </span>
          <span className="font-semibold text-xl tracking-tight">College OS</span>
        </div>
        <div className="card p-6">{children}</div>
        <p className="text-center text-xs text-slate-400 mt-6">
          Everything you need to survive college, in one app.
        </p>
      </div>
    </div>
  );
}