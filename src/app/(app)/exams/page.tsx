"use client";

import { useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/PageHeader";
import Modal from "@/components/Modal";
import { apiFetch, classNames } from "@/components/client-utils";
import { formatDateShort, todayKey } from "@/lib/dates";
import {
  parseSyllabus,
  serializeSyllabus,
  syllabusStats,
  type Unit,
} from "@/lib/examSyllabus";

interface Subject {
  id: string;
  name: string;
  color: string | null;
}
interface Exam {
  id: string;
  title: string;
  date: string;
  time: string | null;
  syllabus: string | null;
  prepPercent: number;
  subject: { id: string; name: string; color: string | null } | null;
}

export default function ExamsPage() {
  const [exams, setExams] = useState<Exam[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [detail, setDetail] = useState<Exam | null>(null);
  const [form, setForm] = useState({
    subjectId: "",
    title: "",
    date: todayKey(),
    time: "10:00 AM",
    syllabus: "",
    prepPercent: 0,
  });
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const [e, s] = await Promise.all([
        apiFetch<{ exams: Exam[] }>("/api/exams"),
        apiFetch<{ subjects: Subject[] }>("/api/subjects"),
      ]);
      setExams(e.exams);
      setSubjects(s.subjects);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  function daysLeft(iso: string): number {
    const d = new Date(iso);
    const now = new Date();
    const a = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
    const b = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.round((a - b) / 86400000);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      // Parse the textarea into units, default to all unchecked.
      const lines = form.syllabus
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      const syllabusValue = lines.length > 0 ? serializeSyllabus(lines.map((text) => ({ text, done: false }))) : null;
      const created = await apiFetch<{ exam: Exam }>("/api/exams", {
        method: "POST",
        body: JSON.stringify({
          subjectId: form.subjectId,
          title: form.title,
          date: form.date,
          time: form.time,
          syllabus: syllabusValue,
          prepPercent: form.prepPercent,
        }),
      });
      setExams((prev) => [...prev, created.exam]);
      setModalOpen(false);
      setForm((f) => ({ ...f, title: "", syllabus: "" }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    }
  }

  async function remove(id: string) {
    await apiFetch(`/api/exams/${id}`, { method: "DELETE" });
    setExams((prev) => prev.filter((x) => x.id !== id));
  }

  const sorted = [...exams].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  return (
    <div>
      <PageHeader
        title="Exams"
        subtitle="Upcoming exams & preparation"
        action={
          <button className="btn-primary" onClick={() => setModalOpen(true)}>
            + Exam
          </button>
        }
      />

      {loading ? (
        <p className="text-slate-400">Loading…</p>
      ) : sorted.length === 0 ? (
        <p className="text-slate-400">No exams scheduled.</p>
      ) : (
        <ul className="space-y-3">
          {sorted.map((e) => {
            const dl = daysLeft(e.date);
            const units = parseSyllabus(e.syllabus);
            const stats = syllabusStats(units);
            const hasSyllabus = units.length > 0;
            const displayPercent = hasSyllabus ? stats.percent : e.prepPercent;
            return (
              <li key={e.id} className="card p-4">
                <div className="flex items-center gap-3">
                  <span
                    className="h-12 w-1.5 rounded-full shrink-0"
                    style={{ backgroundColor: e.subject?.color || "#94a3b8" }}
                  />
                  <button
                    className="min-w-0 flex-1 text-left"
                    onClick={() => setDetail(e)}
                  >
                    <p className="font-medium">{e.title}</p>
                    <p className="text-xs text-slate-400">
                      {formatDateShort(new Date(e.date))}
                      {e.time ? ` · ${e.time}` : ""}
                      {dl < 0 ? " · Past" : dl === 0 ? " · Today" : ` · in ${dl}d`}
                      {hasSyllabus ? ` · ${stats.done}/${stats.total} units` : ""}
                    </p>
                  </button>
                  <div className="text-right shrink-0 w-20">
                    <p className="text-sm font-semibold">{displayPercent}%</p>
                    <div className="h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 mt-1 overflow-hidden">
                      <div
                        className="h-full bg-brand-500 rounded-full"
                        style={{ width: `${displayPercent}%` }}
                      />
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* Add modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Add exam">
        <form onSubmit={save} className="space-y-4">
          <div>
            <label className="label">Subject</label>
            <select
              className="input"
              value={form.subjectId}
              onChange={(e) => setForm({ ...form, subjectId: e.target.value })}
              required
            >
              <option value="">Select subject</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Exam title</label>
            <input
              className="input"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              required
              placeholder="DBMS Mid-Term"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Date</label>
              <input
                className="input"
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="label">Time</label>
              <input
                className="input"
                value={form.time}
                onChange={(e) => setForm({ ...form, time: e.target.value })}
                placeholder="10:00 AM"
              />
            </div>
          </div>
          <div>
            <label className="label">Syllabus (one unit per line)</label>
            <textarea
              className="input"
              rows={4}
              value={form.syllabus}
              onChange={(e) => setForm({ ...form, syllabus: e.target.value })}
              placeholder={"Process Management\nScheduling\nDeadlocks"}
            />
            <p className="text-xs text-slate-400 mt-1">
              You can mark units done later from the exam detail.
            </p>
          </div>
          {error && <p className="text-sm text-rose-600">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn-ghost" onClick={() => setModalOpen(false)}>
              Cancel
            </button>
            <button type="submit" className="btn-primary">
              Add
            </button>
          </div>
        </form>
      </Modal>

      {/* Detail modal */}
      {detail && (
        <DetailModal
          exam={detail}
          onClose={() => setDetail(null)}
          onRemove={async () => {
            await remove(detail.id);
            setDetail(null);
          }}
          onUpdate={(updated) => {
            setExams((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
            setDetail(updated);
          }}
        />
      )}
    </div>
  );
}

// ─────────────────────────── detail modal ───────────────────────────

function DetailModal({
  exam,
  onClose,
  onRemove,
  onUpdate,
}: {
  exam: Exam;
  onClose: () => void;
  onRemove: () => void | Promise<void>;
  onUpdate: (e: Exam) => void;
}) {
  // Hydrate from the exam each time the modal opens for a different exam.
  const initialUnits = useMemo(() => parseSyllabus(exam.syllabus), [exam.id]);
  const [units, setUnits] = useState<Unit[]>(initialUnits);
  const [saving, setSaving] = useState(false);
  const [manualPrep, setManualPrep] = useState(exam.prepPercent);

  // Reset local state when the parent passes a different exam in.
  useEffect(() => {
    setUnits(initialUnits);
    setManualPrep(exam.prepPercent);
  }, [exam.id, initialUnits, exam.prepPercent]);

  const stats = syllabusStats(units);
  const hasSyllabus = units.length > 0;
  const displayPercent = hasSyllabus ? stats.percent : manualPrep;

  async function persist(nextUnits: Unit[], nextManualPrep: number) {
    setSaving(true);
    try {
      const nextSyllabus = nextUnits.length > 0 ? serializeSyllabus(nextUnits) : null;
      const nextPercent = nextUnits.length > 0
        ? syllabusStats(nextUnits).percent
        : nextManualPrep;
      const updated = await apiFetch<{ exam: Exam }>(`/api/exams/${exam.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          syllabus: nextSyllabus,
          prepPercent: nextPercent,
        }),
      });
      onUpdate(updated.exam);
    } finally {
      setSaving(false);
    }
  }

  function toggle(idx: number) {
    const next = units.map((u, i) => (i === idx ? { ...u, done: !u.done } : u));
    setUnits(next);
    void persist(next, manualPrep);
  }

  function editText(idx: number, text: string) {
    const next = units.map((u, i) => (i === idx ? { ...u, text } : u));
    setUnits(next);
  }

  function commitEdit() {
    void persist(units, manualPrep);
  }

  function addUnit() {
    const next = [...units, { text: "New unit", done: false }];
    setUnits(next);
    void persist(next, manualPrep);
  }

  function removeUnit(idx: number) {
    const next = units.filter((_, i) => i !== idx);
    setUnits(next);
    void persist(next, manualPrep);
  }

  function setManual(p: number) {
    setManualPrep(p);
    if (!hasSyllabus) {
      void persist(units, p);
    }
  }

  return (
    <Modal open onClose={onClose} title={exam.title || "Exam"}>
      <div className="space-y-4">
        <div className="flex items-center justify-between text-sm text-slate-500">
          <span>{formatDateShort(new Date(exam.date))}</span>
          {exam.time && <span>{exam.time}</span>}
        </div>

        {/* Prep bar */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-medium text-slate-500">Preparation</label>
            <span className="text-sm font-semibold">{displayPercent}%</span>
          </div>
          <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
            <div
              className="h-full rounded-full bg-brand-500 transition-all"
              style={{ width: `${displayPercent}%` }}
            />
          </div>
          <p className="text-xs text-slate-400 mt-1">
            {hasSyllabus
              ? `Auto from syllabus — ${stats.done} / ${stats.total} units done`
              : "Manual — add units to enable auto-tracking"}
          </p>
        </div>

        {/* Syllabus checklist */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium text-slate-500">Syllabus</p>
            <button
              type="button"
              onClick={addUnit}
              className="text-xs text-brand-600 dark:text-brand-300 hover:underline"
              disabled={saving}
            >
              + Add unit
            </button>
          </div>
          {units.length === 0 ? (
            <p className="text-sm text-slate-400">
              No syllabus yet. Add units above, or edit the exam to paste a syllabus.
            </p>
          ) : (
            <ul className="space-y-1">
              {units.map((u, idx) => (
                <UnitRow
                  key={idx}
                  unit={u}
                  saving={saving}
                  onToggle={() => toggle(idx)}
                  onChangeText={(t) => editText(idx, t)}
                  onCommitText={commitEdit}
                  onRemove={() => removeUnit(idx)}
                />
              ))}
            </ul>
          )}
        </div>

        {/* Manual prep — only when no syllabus */}
        {!hasSyllabus && (
          <div>
            <label className="text-xs font-medium text-slate-500">Preparation</label>
            <input
              type="range"
              min={0}
              max={100}
              value={manualPrep}
              onChange={(e) => setManual(Number(e.target.value))}
              className="w-full accent-brand-600 mt-1"
            />
          </div>
        )}

        <button
          onClick={onRemove}
          className="btn-danger w-full"
        >
          Delete exam
        </button>
      </div>
    </Modal>
  );
}

function UnitRow({
  unit,
  saving,
  onToggle,
  onChangeText,
  onCommitText,
  onRemove,
}: {
  unit: Unit;
  saving: boolean;
  onToggle: () => void;
  onChangeText: (t: string) => void;
  onCommitText: () => void;
  onRemove: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(unit.text);

  useEffect(() => {
    setDraft(unit.text);
  }, [unit.text]);

  return (
    <li className="group flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800/50">
      <input
        type="checkbox"
        checked={unit.done}
        onChange={onToggle}
        disabled={saving}
        className="h-4 w-4 accent-brand-600 shrink-0"
        aria-label={`Mark ${unit.text} as ${unit.done ? "not done" : "done"}`}
      />
      {editing ? (
        <input
          autoFocus
          className="input flex-1 py-1 text-sm"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            const next = draft.trim();
            if (next && next !== unit.text) {
              onChangeText(next);
              onCommitText();
            }
            setEditing(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              (e.target as HTMLInputElement).blur();
            } else if (e.key === "Escape") {
              setDraft(unit.text);
              setEditing(false);
            }
          }}
        />
      ) : (
        <span
          className={classNames(
            "flex-1 text-sm",
            unit.done && "line-through text-slate-400"
          )}
        >
          {unit.text}
        </span>
      )}
      {!editing && (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-slate-500 text-sm"
          aria-label="Edit unit"
        >
          ✎
        </button>
      )}
      <button
        type="button"
        onClick={onRemove}
        className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-rose-500 text-sm"
        aria-label="Remove unit"
        disabled={saving}
      >
        ×
      </button>
    </li>
  );
}
