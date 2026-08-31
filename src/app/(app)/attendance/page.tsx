"use client";

import { useEffect, useState } from "react";
import PageHeader from "@/components/PageHeader";
import Modal from "@/components/Modal";
import { apiFetch, classNames } from "@/components/client-utils";
import { attendanceInsight } from "@/lib/attendance";

interface Subject {
  id: string;
  name: string;
  color: string | null;
}
interface Record {
  id: string;
  total: number;
  attended: number;
  threshold: number;
  subject: { id: string; name: string; color: string | null } | null;
}

const STATUS_STYLE: { [key: string]: string } = {
  good: "text-emerald-600 dark:text-emerald-400",
  warning: "text-amber-600 dark:text-amber-400",
  critical: "text-rose-600 dark:text-rose-400",
};

export default function AttendancePage() {
  const [records, setRecords] = useState<Record[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({
    subjectId: "",
    total: 0,
    attended: 0,
    threshold: 75,
  });
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const [a, s] = await Promise.all([
        apiFetch<{ attendance: Record[] }>("/api/attendance"),
        apiFetch<{ subjects: Subject[] }>("/api/subjects"),
      ]);
      setRecords(a.attendance);
      setSubjects(s.subjects);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  const usedSubjectIds = new Set(records.map((r) => r.subject?.id).filter(Boolean));
  const available = subjects.filter((s) => !usedSubjectIds.has(s.id));

  const avg =
    records.length > 0
      ? Math.round(
          records.reduce((s, r) => s + attendanceInsight(r.total, r.attended, r.threshold).percent, 0) /
            records.length
        )
      : null;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const created = await apiFetch<{ record: Record }>("/api/attendance", {
        method: "POST",
        body: JSON.stringify(form),
      });
      setRecords((prev) => [...prev, created.record]);
      setModalOpen(false);
      setForm({ subjectId: "", total: 0, attended: 0, threshold: 75 });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    }
  }

  async function patch(id: string, data: Partial<Record>) {
    const updated = await apiFetch<{ record: Record }>(`/api/attendance/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
    setRecords((prev) => prev.map((r) => (r.id === id ? updated.record : r)));
  }

  async function remove(id: string) {
    await apiFetch(`/api/attendance/${id}`, { method: "DELETE" });
    setRecords((prev) => prev.filter((r) => r.id !== id));
  }

  return (
    <div>
      <PageHeader
        title="Attendance"
        subtitle="Track and predict your attendance"
        action={
          <button className="btn-primary" onClick={() => setModalOpen(true)}>
            + Add
          </button>
        }
      />

      {avg !== null && (
        <div className="card p-5 mb-5 flex items-center justify-between">
          <div>
            <p className="text-sm text-slate-500 dark:text-slate-400">Average attendance</p>
            <p className="text-3xl font-semibold mt-1">{avg}%</p>
          </div>
          <div className="text-right text-sm text-slate-400">
            {records.length} subject{records.length === 1 ? "" : "s"}
            <br />
            target 75%
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-slate-400">Loading…</p>
      ) : records.length === 0 ? (
        <p className="text-slate-400">No attendance records yet.</p>
      ) : (
        <ul className="space-y-3">
          {records.map((r) => {
            const ins = attendanceInsight(r.total, r.attended, r.threshold);
            return (
              <li key={r.id} className="card p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{r.subject?.name || "Subject"}</p>
                    <p className="text-xs text-slate-400">
                      {r.attended}/{r.total} classes · need {r.threshold}%
                    </p>
                  </div>
                  <p className={classNames("text-2xl font-semibold", STATUS_STYLE[ins.status])}>
                    {ins.percent}%
                  </p>
                </div>
                <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-700 mt-3 overflow-hidden">
                  <div
                    className={classNames(
                      "h-full rounded-full",
                      ins.status === "good"
                        ? "bg-emerald-500"
                        : ins.status === "warning"
                        ? "bg-amber-500"
                        : "bg-rose-500"
                    )}
                    style={{ width: `${Math.min(100, ins.percent)}%` }}
                  />
                </div>

                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  {ins.percent >= r.threshold ? (
                    <span className="badge bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                      You can miss {ins.canMiss} more class{ins.canMiss === 1 ? "" : "es"} and stay above {r.threshold}%
                    </span>
                  ) : (
                    <span className="badge bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300">
                      Attend next {ins.needToAttend} class{ins.needToAttend === 1 ? "" : "es"} to reach {r.threshold}%
                    </span>
                  )}
                </div>

                <div className="mt-4 flex items-center gap-3">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => patch(r.id, { attended: Math.max(0, r.attended - 1) })}
                      className="btn-ghost px-2 py-1"
                    >
                      −
                    </button>
                    <span className="text-xs text-slate-400">attended</span>
                    <button
                      onClick={() => patch(r.id, { attended: r.attended + 1 })}
                      className="btn-ghost px-2 py-1"
                    >
                      +
                    </button>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => patch(r.id, { total: Math.max(r.attended, r.total - 1) })}
                      className="btn-ghost px-2 py-1"
                    >
                      −
                    </button>
                    <span className="text-xs text-slate-400">total</span>
                    <button
                      onClick={() => patch(r.id, { total: r.total + 1 })}
                      className="btn-ghost px-2 py-1"
                    >
                      +
                    </button>
                  </div>
                  <button
                    onClick={() => remove(r.id)}
                    className="ml-auto text-xs text-slate-400 hover:text-rose-500"
                  >
                    Delete
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Add attendance">
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
              {available.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            {available.length === 0 && (
              <p className="text-xs text-slate-400 mt-1">
                Add subjects first (e.g. in Exams or Timetable).
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Total classes</label>
              <input
                className="input"
                type="number"
                min={0}
                value={form.total}
                onChange={(e) => setForm({ ...form, total: Number(e.target.value) })}
                required
              />
            </div>
            <div>
              <label className="label">Attended</label>
              <input
                className="input"
                type="number"
                min={0}
                value={form.attended}
                onChange={(e) => setForm({ ...form, attended: Number(e.target.value) })}
                required
              />
            </div>
          </div>
          <div>
            <label className="label">Threshold (%)</label>
            <input
              className="input"
              type="number"
              min={0}
              max={100}
              value={form.threshold}
              onChange={(e) => setForm({ ...form, threshold: Number(e.target.value) })}
            />
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
    </div>
  );
}
