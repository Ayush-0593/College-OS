// §14 — Next.js boot hook. Called once per server start. We use it to
// start the in-process notification scheduler.
//
// In dev, Next re-evaluates this on each server boot, so the scheduler's
// idempotency guard prevents duplicate intervals.

export function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Dynamic import keeps the scheduler (which pulls in Prisma) out of
    // any Edge / build-time contexts.
    import("./src/lib/scheduler").then((m) => m.startScheduler()).catch((e) => {
      console.error("[instrumentation] failed to start scheduler", e);
    });
  }
}
