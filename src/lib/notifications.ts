// §14 — Smart Reminders shared helpers.
//
// Thin module: kinds, the dedup-key builder, the fire() write (with
// skipDuplicates so the DB unique index does the work), and the per-user
// pref CRUD with sensible defaults.

import { prisma } from "./prisma";
import { dateKey } from "./dates";

export const KIND = [
  "class_soon",
  "due_tomorrow",
  "attendance_low",
  "exam_soon",
  "notice_new",
  "morning_digest",
  "evening_digest",
] as const;
export type NotificationKind = (typeof KIND)[number];

export interface NotificationItem {
  kind: NotificationKind;
  title: string;
  body?: string | null;
  href?: string | null;
  sourceId?: string | null;
  /** yyyy-mm-dd key; defaults to today in `fire()`. */
  date?: string;
}

export interface NotificationPrefs {
  classSoon: boolean;
  dueTomorrow: boolean;
  attendanceLow: boolean;
  examSoon: boolean;
  noticeNew: boolean;
  morningDigest: boolean;
  eveningDigest: boolean;
}

const DEFAULT_PREFS: NotificationPrefs = {
  classSoon: true,
  dueTomorrow: true,
  attendanceLow: true,
  examSoon: true,
  noticeNew: true,
  morningDigest: true,
  eveningDigest: true,
};

/** Build the dedup key. `sourceId` may be empty for kind-only events. */
export function notifKey(
  kind: NotificationKind,
  sourceId: string | null | undefined,
  date: string
): string {
  return `${kind}:${sourceId || ""}:${date}`;
}

/**
 * Insert one or more notifications for a user, deduped by the unique
 * `(userId, notifKey)` index. Returns the number of rows that were actually
 * inserted (i.e. new — duplicates are swallowed silently).
 *
 * Implementation note: Prisma 5's SQLite adapter does NOT accept
 * `createMany({ skipDuplicates: true })` — it errors with
 * "Unknown argument `skipDuplicates`". So we do per-row `create` calls
 * sequentially and catch P2002 (unique constraint) per row. For the call
 * patterns in this app the batch is small (≤ a few rows per tick per user),
 * so the per-row overhead is fine.
 */
export async function fire(
  userId: string,
  items: NotificationItem[]
): Promise<number> {
  if (items.length === 0) return 0;

  const today = dateKey(new Date());
  const rows = items.map((it) => ({
    userId,
    kind: it.kind,
    title: it.title,
    body: it.body ?? null,
    href: it.href ?? null,
    sourceId: it.sourceId ?? null,
    notifKey: notifKey(it.kind, it.sourceId, it.date ?? today),
  }));

  let inserted = 0;
  for (const data of rows) {
    try {
      await prisma.notification.create({ data });
      inserted += 1;
    } catch (e: unknown) {
      // P2002 = unique constraint violation → row already exists, skip.
      if (
        typeof e === "object" &&
        e !== null &&
        "code" in e &&
        (e as { code?: string }).code === "P2002"
      ) {
        continue;
      }
      throw e;
    }
  }
  return inserted;
}

/** Read prefs for a user. Returns DEFAULT_PREFS if no row yet. */
export async function getPrefs(userId: string): Promise<NotificationPrefs> {
  const row = await prisma.notificationPref.findUnique({ where: { userId } });
  if (!row) return { ...DEFAULT_PREFS };
  return {
    classSoon: row.classSoon,
    dueTomorrow: row.dueTomorrow,
    attendanceLow: row.attendanceLow,
    examSoon: row.examSoon,
    noticeNew: row.noticeNew,
    morningDigest: row.morningDigest,
    eveningDigest: row.eveningDigest,
  };
}

/** Patch prefs. Creates the row on first call (upsert). */
export async function setPrefs(
  userId: string,
  patch: Partial<NotificationPrefs>
): Promise<NotificationPrefs> {
  const next = await prisma.notificationPref.upsert({
    where: { userId },
    create: {
      userId,
      classSoon: patch.classSoon ?? DEFAULT_PREFS.classSoon,
      dueTomorrow: patch.dueTomorrow ?? DEFAULT_PREFS.dueTomorrow,
      attendanceLow: patch.attendanceLow ?? DEFAULT_PREFS.attendanceLow,
      examSoon: patch.examSoon ?? DEFAULT_PREFS.examSoon,
      noticeNew: patch.noticeNew ?? DEFAULT_PREFS.noticeNew,
      morningDigest: patch.morningDigest ?? DEFAULT_PREFS.morningDigest,
      eveningDigest: patch.eveningDigest ?? DEFAULT_PREFS.eveningDigest,
    },
    update: {
      classSoon: patch.classSoon ?? undefined,
      dueTomorrow: patch.dueTomorrow ?? undefined,
      attendanceLow: patch.attendanceLow ?? undefined,
      examSoon: patch.examSoon ?? undefined,
      noticeNew: patch.noticeNew ?? undefined,
      morningDigest: patch.morningDigest ?? undefined,
      eveningDigest: patch.eveningDigest ?? undefined,
    },
  });
  return {
    classSoon: next.classSoon,
    dueTomorrow: next.dueTomorrow,
    attendanceLow: next.attendanceLow,
    examSoon: next.examSoon,
    noticeNew: next.noticeNew,
    morningDigest: next.morningDigest,
    eveningDigest: next.eveningDigest,
  };
}

/** Convenience check used by the scheduler before firing an event. */
export function prefAllows(
  prefs: NotificationPrefs,
  kind: NotificationKind
): boolean {
  switch (kind) {
    case "class_soon":
      return prefs.classSoon;
    case "due_tomorrow":
      return prefs.dueTomorrow;
    case "attendance_low":
      return prefs.attendanceLow;
    case "exam_soon":
      return prefs.examSoon;
    case "notice_new":
      return prefs.noticeNew;
    case "morning_digest":
      return prefs.morningDigest;
    case "evening_digest":
      return prefs.eveningDigest;
  }
}

/** Human-readable label for the kind. Used by the bell + feed. */
export function kindLabel(kind: NotificationKind): string {
  switch (kind) {
    case "class_soon":
      return "Class";
    case "due_tomorrow":
      return "Deadline";
    case "attendance_low":
      return "Attendance";
    case "exam_soon":
      return "Exam";
    case "notice_new":
      return "Notice";
    case "morning_digest":
      return "Morning";
    case "evening_digest":
      return "Evening";
  }
}
