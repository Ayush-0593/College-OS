"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import Modal from "@/components/Modal";
import { apiFetch } from "@/components/client-utils";

interface User {
  id: string;
  name: string;
  email: string;
  student: {
    course: string | null;
    semester: number;
    cgpa: number;
    collegeName: string | null;
    department: string | null;
    streak: number;
  } | null;
}
interface Subject {
  id: string;
  name: string;
  code: string | null;
  faculty: string | null;
  color: string | null;
}

const COLORS = ["#3b62f0", "#16a34a", "#db2777", "#ea580c", "#7c3aed", "#0891b2", "#ca8a04"];

export default function ProfilePage() {
  const [user, setUser] = useState<User | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [subjectModal, setSubjectModal] = useState(false);
  const [form, setForm] = useState({ name: "", course: "", semester: 3, cgpa: 0, collegeName: "", department: "" });
  const [subForm, setSubForm] = useState({ name: "", code: "", faculty: "", color: COLORS[0] });
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const [u, s] = await Promise.all([
        apiFetch<{ user: User }>("/api/profile"),
        apiFetch<{ subjects: Subject[] }>("/api/subjects"),
      ]);
      setUser(u.user);
      setSubjects(s.subjects);
      setForm({
        name: u.user.name,
        course: u.user.student?.course || "",
        semester: u.user.student?.semester || 3,
        cgpa: u.user.student?.cgpa || 0,
        collegeName: u.user.student?.collegeName || "",
        department: u.user.student?.department || "",
      });
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const updated = await apiFetch<{ user: User }>("/api/profile", {
        method: "PATCH",
        body: JSON.stringify({ name: form.name, student: {
          course: form.course || null,
          semester: Number(form.semester),
          cgpa: Number(form.cgpa),
          collegeName: form.collegeName || null,
          department: form.department || null,
        } }),
      });
      setUser(updated.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    }
  }

  async function saveSubject(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const created = await apiFetch<{ subject: Subject }>("/api/subjects", {
        method: "POST",
        body: JSON.stringify(subForm),
      });
      setSubjects((prev) => [...prev, created.subject]);
      setSubjectModal(false);
      setSubForm({ name: "", code: "", faculty: "", color: COLORS[0] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    }
  }

  async function removeSubject(id: string) {
    await apiFetch(`/api/subjects/${id}`, { method: "DELETE" });
    setSubjects((prev) => prev.filter((s) => s.id !== id));
  }

  if (loading || !user) {
    return <p className="text-slate-400">Loading…</p>;
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Me" subtitle="Your profile & subjects" />

      {/* Profile card */}
      <div className="card p-6">
        <div className="flex items-center gap-4">
          <span className="grid place-items-center h-16 w-16 rounded-2xl bg-brand-600 text-white text-2xl font-semibold">
            {user.name.charAt(0).toUpperCase()}
          </span>
          <div>
            <p className="text-xl font-semibold">{user.name}</p>
            <p className="text-sm text-slate-400">{user.email}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6">
          <Metric label="Course" value={user.student?.course || "—"} />
          <Metric label="Semester" value={String(user.student?.semester || "—")} />
          <Metric label="CGPA" value={user.student?.cgpa ? String(user.student.cgpa) : "—"} />
          <Metric label="🔥 Streak" value={user.student?.streak ? `${user.student.streak}d` : "—"} />
        </div>
      </div>

      {/* Edit profile */}
      <form onSubmit={saveProfile} className="card p-5 space-y-4">
        <h2 className="font-semibold">Edit details</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="label">Full name</label>
            <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <label className="label">College</label>
            <input className="input" value={form.collegeName} onChange={(e) => setForm({ ...form, collegeName: e.target.value })} />
          </div>
          <div>
            <label className="label">Course</label>
            <input className="input" value={form.course} onChange={(e) => setForm({ ...form, course: e.target.value })} placeholder="B.Tech CSE" />
          </div>
          <div>
            <label className="label">Department</label>
            <input className="input" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} />
          </div>
          <div>
            <label className="label">Semester</label>
            <select className="input" value={form.semester} onChange={(e) => setForm({ ...form, semester: Number(e.target.value) })}>
              {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">CGPA</label>
            <input className="input" type="number" step="0.01" min={0} max={10} value={form.cgpa} onChange={(e) => setForm({ ...form, cgpa: Number(e.target.value) })} />
          </div>
        </div>
        {error && <p className="text-sm text-rose-600">{error}</p>}
        <button className="btn-primary" type="submit">Save changes</button>
      </form>

      {/* Notification preferences — §14 */}
      <NotificationPrefsCard />

      {/* Integrations — §22 */}
      <Link
        href="/calendar"
        className="card p-5 block hover:border-brand-300 dark:hover:border-brand-700 transition-colors"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-semibold">Integrations</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Subscribe to your schedule in iOS Calendar, Google Calendar, or
              Outlook. Updates appear automatically.
            </p>
          </div>
          <span className="text-sm text-brand-600 dark:text-brand-300 shrink-0">
            Open calendar →
          </span>
        </div>
      </Link>

      {/* Subjects */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold">Subjects</h2>
          <button className="btn-ghost" onClick={() => setSubjectModal(true)}>+ Add</button>
        </div>
        {subjects.length === 0 ? (
          <p className="text-sm text-slate-400">No subjects yet. Add your first one.</p>
        ) : (
          <ul className="grid sm:grid-cols-2 gap-2">
            {subjects.map((s) => (
              <li key={s.id} className="flex items-center gap-3 rounded-xl p-3 bg-slate-50 dark:bg-slate-800/50">
                <span className="h-9 w-1.5 rounded-full" style={{ backgroundColor: s.color || "#94a3b8" }} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{s.name}</p>
                  <p className="text-xs text-slate-400">
                    {[s.code, s.faculty].filter(Boolean).join(" · ") || "—"}
                  </p>
                </div>
                <button onClick={() => removeSubject(s.id)} className="text-slate-300 hover:text-rose-500 text-sm">×</button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Modal open={subjectModal} onClose={() => setSubjectModal(false)} title="Add subject">
        <form onSubmit={saveSubject} className="space-y-4">
          <div>
            <label className="label">Name</label>
            <input className="input" value={subForm.name} onChange={(e) => setSubForm({ ...subForm, name: e.target.value })} required placeholder="Data Structures" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Code</label>
              <input className="input" value={subForm.code} onChange={(e) => setSubForm({ ...subForm, code: e.target.value })} placeholder="CS301" />
            </div>
            <div>
              <label className="label">Faculty</label>
              <input className="input" value={subForm.faculty} onChange={(e) => setSubForm({ ...subForm, faculty: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="label">Color</label>
            <div className="flex gap-2">
              {COLORS.map((c) => (
                <button
                  type="button"
                  key={c}
                  onClick={() => setSubForm({ ...subForm, color: c })}
                  className={`h-8 w-8 rounded-full ${subForm.color === c ? "ring-2 ring-offset-2 ring-slate-400 dark:ring-offset-slate-900" : ""}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
          {error && <p className="text-sm text-rose-600">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn-ghost" onClick={() => setSubjectModal(false)}>Cancel</button>
            <button type="submit" className="btn-primary">Add</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 p-3">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="font-semibold mt-0.5 truncate">{value}</p>
    </div>
  );
}

interface Prefs {
  classSoon: boolean;
  dueTomorrow: boolean;
  attendanceLow: boolean;
  examSoon: boolean;
  noticeNew: boolean;
  morningDigest: boolean;
  eveningDigest: boolean;
}

const PREF_ROWS: { key: keyof Prefs; title: string; desc: string }[] = [
  {
    key: "classSoon",
    title: "Class starting soon",
    desc: "30-minute heads-up before today's scheduled classes.",
  },
  {
    key: "dueTomorrow",
    title: "Assignment due tomorrow",
    desc: "Evening reminder for tasks due the next day.",
  },
  {
    key: "attendanceLow",
    title: "Low-attendance warnings",
    desc: "Daily nudge when a subject is below your threshold.",
  },
  {
    key: "examSoon",
    title: "Upcoming exams",
    desc: "Daily reminder starting 7 days before each exam.",
  },
  {
    key: "noticeNew",
    title: "New notices",
    desc: "Bell ping when you post a new notice.",
  },
  {
    key: "morningDigest",
    title: "Morning brief",
    desc: "7 AM — preview today's classes, tomorrow's deadlines, low-attendance alerts.",
  },
  {
    key: "eveningDigest",
    title: "Evening brief",
    desc: "9 PM — recap today, preview tomorrow, surface unread notices.",
  },
];

function NotificationPrefsCard() {
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<keyof Prefs | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch<{ prefs: Prefs }>("/api/notifications/prefs");
        if (!cancelled) setPrefs(res.prefs);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load preferences.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function toggle(key: keyof Prefs) {
    if (!prefs || saving) return;
    const next = !prefs[key];
    setPrefs({ ...prefs, [key]: next });
    setSaving(key);
    setError(null);
    try {
      const res = await apiFetch<{ prefs: Prefs }>("/api/notifications/prefs", {
        method: "PATCH",
        body: JSON.stringify({ [key]: next }),
      });
      setPrefs(res.prefs);
    } catch (err) {
      // revert on failure
      setPrefs({ ...prefs, [key]: !next });
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="card p-5">
      <div className="mb-4">
        <h2 className="font-semibold">Notification preferences</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          Choose which reminders appear in your inbox.
        </p>
      </div>
      {loading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {PREF_ROWS.map((row) => {
            const on = !!prefs?.[row.key];
            const isSaving = saving === row.key;
            return (
              <li
                key={row.key}
                className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">{row.title}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {row.desc}
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={on}
                  aria-label={row.title}
                  disabled={isSaving}
                  onClick={() => toggle(row.key)}
                  className={
                    "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 " +
                    (on ? "bg-brand-600" : "bg-slate-300 dark:bg-slate-700")
                  }
                >
                  <span
                    className={
                      "inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform " +
                      (on ? "translate-x-5" : "translate-x-0.5")
                    }
                  />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {error && <p className="text-sm text-rose-600 mt-3">{error}</p>}
    </div>
  );
}