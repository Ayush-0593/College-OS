"use client";

import { useEffect, useState } from "react";
import PageHeader from "@/components/PageHeader";
import Modal from "@/components/Modal";
import { apiFetch, classNames } from "@/components/client-utils";
import { relativeTime } from "@/lib/dates";

interface Notice {
  id: string;
  title: string;
  body: string | null;
  category: string;
  source: string | null;
  isRead: boolean;
  createdAt: string;
}

const CATEGORIES = [
  "Academic",
  "Examination",
  "Events",
  "Fees",
  "Placement",
  "Holiday",
  "Emergency",
];
const CAT_STYLE: { [key: string]: string } = {
  Academic: "bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300",
  Examination: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
  Events: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  Fees: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  Placement: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
  Holiday: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
  Emergency: "bg-red-200 text-red-800 dark:bg-red-900/60 dark:text-red-200",
};

export default function NoticesPage() {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [detail, setDetail] = useState<Notice | null>(null);
  const [form, setForm] = useState({
    title: "",
    body: "",
    category: "Academic",
    source: "",
  });
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const data = await apiFetch<{ notices: Notice[] }>("/api/notices");
      setNotices(data.notices);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const created = await apiFetch<{ notice: Notice }>("/api/notices", {
        method: "POST",
        body: JSON.stringify(form),
      });
      setNotices((prev) => [created.notice, ...prev]);
      setModalOpen(false);
      setForm({ title: "", body: "", category: "Academic", source: "" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    }
  }

  async function toggleRead(n: Notice) {
    const updated = await apiFetch<{ notice: Notice }>(`/api/notices/${n.id}`, {
      method: "PATCH",
      body: JSON.stringify({ isRead: !n.isRead }),
    });
    setNotices((prev) => prev.map((x) => (x.id === n.id ? updated.notice : x)));
    if (detail?.id === n.id) setDetail(updated.notice);
  }

  async function remove(id: string) {
    await apiFetch(`/api/notices/${id}`, { method: "DELETE" });
    setNotices((prev) => prev.filter((x) => x.id !== id));
    setDetail(null);
  }

  const unread = notices.filter((n) => !n.isRead).length;

  return (
    <div>
      <PageHeader
        title="Notices"
        subtitle={unread > 0 ? `${unread} unread` : "Official announcements"}
        action={
          <button className="btn-primary" onClick={() => setModalOpen(true)}>
            + Notice
          </button>
        }
      />

      {loading ? (
        <p className="text-slate-400">Loading…</p>
      ) : notices.length === 0 ? (
        <p className="text-slate-400">No notices yet.</p>
      ) : (
        <ul className="space-y-3">
          {notices.map((n) => (
            <li key={n.id}>
              <button
                onClick={() => {
                  setDetail(n);
                  if (!n.isRead) toggleRead(n);
                }}
                className={classNames(
                  "card p-4 w-full text-left flex items-start gap-3",
                  !n.isRead && "ring-1 ring-brand-200 dark:ring-brand-900"
                )}
              >
                <span className={classNames("badge shrink-0 mt-0.5", CAT_STYLE[n.category] || CAT_STYLE.Academic)}>
                  {n.category}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium truncate">{n.title}</p>
                    {!n.isRead && <span className="h-2 w-2 rounded-full bg-brand-500 shrink-0" />}
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {n.source ? `${n.source} · ` : ""}
                    {relativeTime(new Date(n.createdAt))}
                  </p>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="New notice">
        <form onSubmit={save} className="space-y-4">
          <div>
            <label className="label">Title</label>
            <input
              className="input"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              required
              placeholder="Mid-term schedule released"
            />
          </div>
          <div>
            <label className="label">Category</label>
            <select
              className="input"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Body</label>
            <textarea
              className="input"
              rows={3}
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Source (optional)</label>
            <input
              className="input"
              value={form.source}
              onChange={(e) => setForm({ ...form, source: e.target.value })}
              placeholder="Admin Office"
            />
          </div>
          {error && <p className="text-sm text-rose-600">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn-ghost" onClick={() => setModalOpen(false)}>
              Cancel
            </button>
            <button type="submit" className="btn-primary">
              Post
            </button>
          </div>
        </form>
      </Modal>

      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail?.title || "Notice"}>
        {detail && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className={classNames("badge", CAT_STYLE[detail.category] || CAT_STYLE.Academic)}>
                {detail.category}
              </span>
              {detail.source && <span className="text-xs text-slate-400">{detail.source}</span>}
            </div>
            {detail.body && <p className="text-sm text-slate-600 dark:text-slate-300">{detail.body}</p>}
            <p className="text-xs text-slate-400">{relativeTime(new Date(detail.createdAt))}</p>
            <div className="flex justify-between pt-2">
              <button
                onClick={() => toggleRead(detail)}
                className="btn-ghost"
              >
                {detail.isRead ? "Mark unread" : "Mark read"}
              </button>
              <button
                onClick={() => remove(detail.id)}
                className="btn-danger"
              >
                Delete
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
