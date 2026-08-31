// Date helpers shared across College OS. Weeks start Monday (index 0).

export const DAY_NAMES = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

export const DAY_NAMES_SHORT = [
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
  "Sun",
];

export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** 0 = Monday ... 6 = Sunday */
export function dayIndex(date: Date = new Date()): number {
  return (date.getDay() + 6) % 7;
}

/** Convert "HH:MM" to minutes since midnight */
export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export function nowMinutes(): number {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

export function formatTimeRange(start: string, end: string): string {
  return `${format12(start)} – ${format12(end)}`;
}

export function format12(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${m.toString().padStart(2, "0")} ${period}`;
}

export function minutesUntil(targetHHMM: string, dayOffset = 0): number {
  const now = new Date();
  const base = new Date(now);
  base.setDate(base.getDate() + dayOffset);
  const target = new Date(base);
  target.setHours(0, 0, 0, 0);
  target.setMinutes(toMinutes(targetHHMM));
  return Math.round((target.getTime() - now.getTime()) / 60000);
}

export function humanizeMinutes(mins: number): string {
  if (mins <= 0) return "now";
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (m === 0) return `${h} hr`;
  return `${h} hr ${m} min`;
}

export function formatDateLong(date: Date): string {
  return `${DAY_NAMES[dayIndex(date)]}, ${date.getDate()} ${MONTH_NAMES[date.getMonth()]}`;
}

export function formatDateShort(date: Date): string {
  return `${DAY_NAMES_SHORT[dayIndex(date)]} ${date.getDate()} ${MONTH_NAMES[date.getMonth()].slice(0, 3)}`;
}

export function relativeTime(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs > 1 ? "s" : ""} ago`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days} day${days > 1 ? "s" : ""} ago`;
  const weeks = Math.round(days / 7);
  return `${weeks} week${weeks > 1 ? "s" : ""} ago`;
}

/** Date-only key e.g. 2026-08-26 */
export function dateKey(date: Date): string {
  return `${date.getFullYear()}-${(date.getMonth() + 1)
    .toString()
    .padStart(2, "0")}-${date.getDate().toString().padStart(2, "0")}`;
}

/** Parse a yyyy-mm-dd string into a local Date at midnight */
export function parseDateKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Build a Date from a yyyy-mm-dd date input + HH:MM time input */
export function combineDateTime(dateKey: string, time?: string): Date {
  const [y, m, d] = dateKey.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  if (time) {
    const [h, min] = time.split(":").map(Number);
    date.setHours(h, min, 0, 0);
  } else {
    date.setHours(0, 0, 0, 0);
  }
  return date;
}

/** Return a new Date at local midnight of the same day. */
export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** Return a new Date shifted by `n` days (negative for past). */
export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

/** Return a new Date shifted by `n` hours. */
export function addHours(d: Date, n: number): Date {
  const x = new Date(d);
  x.setHours(x.getHours() + n);
  return x;
}

/** Today's date as yyyy-mm-dd */
export function todayKey(): string {
  return dateKey(new Date());
}
