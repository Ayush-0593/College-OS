"use client";

import { useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/PageHeader";
import Modal from "@/components/Modal";
import { apiFetch, classNames } from "@/components/client-utils";
import { formatDateShort, todayKey } from "@/lib/dates";

interface Subject {
  id: string;
  name: string;
  color: string | null;
}
interface Assignment {
  id: string;
  title: string;
  description: string | null;
  professor: string | null;
  dueDate: string;
  priority: string;
  status: string;
  subject: { id: string; name: string; color: string | null } | null;
}

const PRIORITIES = [
  { v: "high", label: "High", cls: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300" },
  { v: "medium", label: "Medium", cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
  { v: "low", label: "Low", cls: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" },
];
const STATUSES = ["not_started", "in_progress", "submitted", "late"];
const STATUS_LABEL: { [key: string]: string } = {
  not_started: "Not started",
  in_progress: "In progress",
  submitted: "Submitted",
  late: "Late",
};

export default function AssignmentsPage() {
  const [items, setItems] = useState<Assignment[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [filter, setFilter] = useState<"all" | "open" | "done">("all");
  const [form, setForm] = useState({
    subjectId: "",
    title: "",
    description: "",
    professor: "",
    dueDate: todayKey(),
    dueTime: "23:59",
    priority: "medium",
    status: "not_started",
  });
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const [a, s] = await Promise.all([
        apiFetch<{ assignments: Assignment[] }>("/api/assignments"),
        apiFetch<{ subjects: Subject[] }>("/api/subjects"),
      ]);
      setItems(a.assignments);
      setSubjects(s.subjects);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    return items.filter((i) =>
      filter === "all"
        ? true
        : filter === "open"
        ? i.status !== "submitted"
        : i.status === "submitted"
    );
  }, [items, filter]);

  function daysLeft(iso: string): number {
    const due = new Date(iso);
    const now = new Date();
    const a = Date.UTC(due.getFullYear(), due.getMonth(), due.getDate());
    const b = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.round((a - b) / 86400000);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const created = await apiFetch<{ assignment: Assignment }>("/api/assignments", {
        method: "POST",
        body: JSON.stringify(form),
      });
      setItems((prev) => [...prev, created.assignment]);
      setModalOpen(false);
      setForm((f) => ({ ...f, title: "", description: "", professor: "" }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    }
  }

  async function setStatus(id: string, status: string) {
    const updated = await apiFetch<{ assignment: Assignment }>(`/api/assignments/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
    setItems((prev) => prev.map((i) => (i.id === id ? updated.assignment : i)));
  }

  async function remove(id: string) {
    await apiFetch(`/api/assignments/${id}`, { method: "DELETE" });
    setItems((prev) => prev.filter((i) => i.id !== id));
  }

  const prio = (v: string) => PRIORITIES.find((p) => p.v === v)!;

  return (
    <div>
      <PageHeader
        title="Tasks"
        subtitle="Assignments & deadlines"
        action={
          <button className="btn-primary" onClick={() => setModalOpen(true)}>
            + Assignment
          </button>
        }
      />

      <div className="flex gap-2 mb-4">
        {(["all", "open", "done"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={classNames(
              "px-3 py-1.5 rounded-full text-sm font-medium capitalize",
              filter === f
                ? "bg-brand-600 text-white"
                : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
            )}
          >
            {f === "all" ? "All" : f === "open" ? "Open" : "Done"}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-slate-400">Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="text-slate-400">No assignments here.</p>
      ) : (
        <ul className="space-y-3">
          {filtered.map((a) => {
            const dl = daysLeft(a.dueDate);
            return (
              <li key={a.id} className="card p-4">
                <div className="flex items-start gap-3">
                  <span
                    className={classNames(
                      "mt-1 h-3 w-3 rounded-full shrink-0",
                      a.status === "submitted"
                        ? "bg-emerald-500"
                        : a.status === "in_progress"
                        ? "bg-amber-500"
                        : "bg-slate-300 dark:bg-slate-600"
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium">{a.title}</p>
                      <span className={classNames("badge shrink-0", prio(a.priority).cls)}>
                        {prio(a.priority).label}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400 mt-1">
                      {a.subject && (
                        <span className="inline-flex items-center gap-1">
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: a.subject.color || "#94a3b8" }}
                          />
                          {a.subject.name}
                        </span>
                      )}
                      {a.professor && <span>{a.professor}</span>}
                      <span
                        className={classNames(
                          dl < 0 ? "text-rose-500 font-medium" : dl === 0 ? "text-amber-500 font-medium" : ""
                        )}
                      >
                        {formatDateShort(new Date(a.dueDate))}
                        {dl < 0
                          ? ` · ${Math.abs(dl)}d overdue`
                          : dl === 0
                          ? " · Due today"
                          : ` · in ${dl}d`}
                      </span>
                    </div>
                    {a.description && (
                      <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">{a.description}</p>
                    )}
                    <div className="flex items-center gap-2 mt-3">
                      <select
                        className="text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent px-2 py-1"
                        value={a.status}
                        onChange={(e) => setStatus(a.id, e.target.value)}
                      >
                        {STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {STATUS_LABEL[s]}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => remove(a.id)}
                        className="text-xs text-slate-400 hover:text-rose-500"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="New assignment">
        <form onSubmit={save} className="space-y-4">
          <div>
            <label className="label">Title</label>
            <input
              className="input"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              required
              placeholder="Binary Tree Assignment"
            />
          </div>
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
            <label className="label">Description</label>
            <textarea
              className="input"
              rows={2}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Due date</label>
              <input
                className="input"
                type="date"
                value={form.dueDate}
                onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="label">Due time</label>
              <input
                className="input"
                type="time"
                value={form.dueTime}
                onChange={(e) => setForm({ ...form, dueTime: e.target.value })}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Priority</label>
              <select
                className="input"
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: e.target.value })}
              >
                {PRIORITIES.map((p) => (
                  <option key={p.v} value={p.v}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Professor</label>
              <input
                className="input"
                value={form.professor}
                onChange={(e) => setForm({ ...form, professor: e.target.value })}
              />
            </div>
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
