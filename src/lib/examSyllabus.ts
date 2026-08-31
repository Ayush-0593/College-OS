// §9 follow-up — per-unit syllabus with checkboxes.
//
// Storage: Exam.syllabus is a single nullable text column. We store JSON of
// the shape `Array<{ text: string; done: boolean }>`. Legacy rows written
// before this feature are plain multi-line text — parseSyllabus detects that
// shape and converts on read (every line as { done: false }).

export interface Unit {
  text: string;
  done: boolean;
}

export interface SyllabusStats {
  done: number;
  total: number;
  /** round(done / total * 100); 0 when total === 0 */
  percent: number;
}

/** Parse the syllabus column into structured units. */
export function parseSyllabus(raw: string | null | undefined): Unit[] {
  if (!raw) return [];
  const trimmed = raw.trim();
  if (!trimmed) return [];

  // Try JSON first.
  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed
          .filter((u): u is { text?: unknown; done?: unknown } => u && typeof u === "object")
          .map((u) => ({
            text: String(u.text ?? "").trim(),
            done: Boolean(u.done),
          }))
          .filter((u) => u.text.length > 0);
      }
    } catch {
      // fall through to legacy parsing
    }
  }

  // Legacy: plain multi-line text. Every line is unchecked.
  return trimmed
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((text) => ({ text, done: false }));
}

/** Serialize structured units back to the column value (JSON string). */
export function serializeSyllabus(units: Unit[]): string {
  // Always emit JSON; empty list serializes to "[]".
  return JSON.stringify(
    units
      .map((u) => ({ text: u.text.trim(), done: Boolean(u.done) }))
      .filter((u) => u.text.length > 0)
  );
}

/** Stats for the auto-derived prep %. */
export function syllabusStats(units: Unit[]): SyllabusStats {
  const total = units.length;
  const done = units.filter((u) => u.done).length;
  const percent = total === 0 ? 0 : Math.round((done / total) * 100);
  return { done, total, percent };
}
