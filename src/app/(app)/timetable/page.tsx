"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import Modal from "@/components/Modal";
import { apiFetch, classNames } from "@/components/client-utils";
import {
  DAY_NAMES,
  DAY_NAMES_SHORT,
  dayIndex,
  format12,
  toMinutes,
} from "@/lib/dates";

interface Subject {
  id: string;
  name: string;
  color: string | null;
  faculty: string | null;
}
interface Entry {
  id: string;
  subjectId: string | null;
  subject: { id: string; name: string; color: string | null } | null;
  day: number;
  start: string;
  end: string;
  room: string | null;
  type: string;
  label: string | null;
}

export default function TimetablePage() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({
    subjectId: "",
    day: dayIndex(),
    start: "09:00",
    end: "10:00",
    room: "",
    type: "class",
    label: "",
  });
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const [e, s] = await Promise.all([
        apiFetch<{ entries: Entry[] }>("/api/timetable"),
        apiFetch<{ subjects: Subject[] }>("/api/subjects"),
      ]);
      setEntries(e.entries);
      setSubjects(s.subjects);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const byDay = useMemo(() => {
    const map: Record<number, Entry[]> = {};
    for (let i = 0; i < 7; i++) map[i] = [];
    for (const e of entries) {
      map[e.day]?.push(e);
    }
    for (const k of Object.keys(map)) {
      map[+k].sort((a, b) => toMinutes(a.start) - toMinutes(b.start));
    }
    return map;
  }, [entries]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const created = await apiFetch<{ entry: Entry }>("/api/timetable", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          subjectId: form.type === "break" ? null : form.subjectId || null,
        }),
      });
      setEntries((prev) => [...prev, created.entry]);
      setModalOpen(false);
      setForm((f) => ({ ...f, room: "", label: "" }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    }
  }

  async function remove(id: string) {
    await apiFetch(`/api/timetable/${id}`, { method: "DELETE" });
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }

  return (
    <div>
      <PageHeader
        title="Schedule"
        subtitle="Your weekly timetable"
        action={
          <div className="flex items-center gap-2">
            <Link href="/calendar" className="btn-ghost">
              Export calendar
            </Link>
            <button className="btn-primary" onClick={() => setModalOpen(true)}>
              + Add class
            </button>
          </div>
        }
      />

      {loading ? (
        <p className="text-slate-400">Loading…</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {DAY_NAMES.map((day, i) => (
            <div key={day} className="card p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold">{day}</h3>
                <span className="text-xs text-slate-400">
                  {byDay[i].filter((e) => e.type !== "break").length} classes
                </span>
              </div>
              {byDay[i].length === 0 ? (
                <p className="text-xs text-slate-400">Free day</p>
              ) : (
                <ul className="space-y-2">
                  {byDay[i].map((e) => (
                    <li
                      key={e.id}
                      className="group flex items-start gap-2 rounded-xl p-2 hover:bg-slate-50 dark:hover:bg-slate-800"
                    >
                      <span
                        className="h-9 w-1.5 rounded-full shrink-0"
                        style={{
                          backgroundColor:
                            e.type === "break"
                              ? "#cbd5e1"
                              : e.subject?.color || "#94a3b8",
                        }}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">
                          {e.type === "break" ? e.label || "Break" : e.subject?.name || "Class"}
                        </p>
                        <p className="text-xs text-slate-400">
                          {format12(e.start)} – {format12(e.end)}
                          {e.room ? ` · Room ${e.room}` : ""}
                        </p>
                      </div>
                      <button
                        onClick={() => remove(e.id)}
                        className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-rose-500 text-sm"
                        aria-label="Delete"
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Add to timetable">
        <form onSubmit={save} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Day</label>
              <select
                className="input"
                value={form.day}
                onChange={(e) => setForm({ ...form, day: Number(e.target.value) })}
              >
                {DAY_NAMES.map((d, i) => (
                  <option key={d} value={i}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Type</label>
              <select
                className="input"
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
              >
                <option value="class">Class</option>
                <option value="lab">Lab</option>
                <option value="break">Break</option>
              </select>
            </div>
          </div>

          {form.type !== "break" && (
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
              {subjects.length === 0 && (
                <p className="text-xs text-slate-400 mt-1">
                  Add subjects first (in Exams or Attendance).
                </p>
              )}
            </div>
          )}

          {form.type === "break" && (
            <div>
              <label className="label">Label</label>
              <input
                className="input"
                value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
                placeholder="Break / Lunch"
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Start</label>
              <input
                className="input"
                type="time"
                value={form.start}
                onChange={(e) => setForm({ ...form, start: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="label">End</label>
              <input
                className="input"
                type="time"
                value={form.end}
                onChange={(e) => setForm({ ...form, end: e.target.value })}
                required
              />
            </div>
          </div>

          {form.type !== "break" && (
            <div>
              <label className="label">Room (optional)</label>
              <input
                className="input"
                value={form.room}
                onChange={(e) => setForm({ ...form, room: e.target.value })}
                placeholder="AB-204"
              />
            </div>
          )}

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
    </div>
  );
}
