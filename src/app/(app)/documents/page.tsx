"use client";

import { useEffect, useRef, useState } from "react";
import PageHeader from "@/components/PageHeader";
import Modal from "@/components/Modal";
import { apiFetch, classNames } from "@/components/client-utils";
import { relativeTime } from "@/lib/dates";

// §11 — Document Vault. Upload, list by category, view, delete.
// Matches the design language of the other client pages (exams, tasks).

const CATEGORIES = ["All", "Notes", "PYQ", "Syllabus", "Marksheet", "Other"] as const;
type Category = (typeof CATEGORIES)[number];

const MAX_SIZE = 20 * 1024 * 1024;
const ALLOWED_MIME = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
];

interface Document {
  id: string;
  title: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  category: string;
  storagePath: string;
  createdAt: string;
  // §21 — RAG index status.
  //   chunkCount >  0  → indexed, N chunks searchable by Ask My College
  //   chunkCount === 0 → indexed, but extracted 0 text chunks (e.g. blank
  //                       or image-only PDF; indexError explains why)
  //   chunkCount === -1 → indexing failed (tooltip = indexError)
  //   indexedAt is null  → indexing in progress (upload race)
  chunkCount: number;
  indexedAt: string | null;
  indexError: string | null;
}

export default function DocumentsPage() {
  const [items, setItems] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Category>("All");
  const [modalOpen, setModalOpen] = useState(false);
  const [viewer, setViewer] = useState<Document | null>(null);

  async function load(category: Category) {
    setLoading(true);
    setError(null);
    try {
      const qs = category === "All" ? "" : `?category=${encodeURIComponent(category)}`;
      const data = await apiFetch<{ documents: Document[] }>(`/api/documents${qs}`);
      setItems(data.documents);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load(filter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  async function onUploaded(doc: Document) {
    // If the new doc matches the current filter (or filter is All), refresh
    // from the server so ordering and counts stay consistent.
    if (filter === "All" || filter === doc.category) {
      await load(filter);
    }
    setModalOpen(false);
  }

  async function onDelete(doc: Document) {
    if (!confirm(`Delete "${doc.title}"? This cannot be undone.`)) return;
    try {
      await apiFetch(`/api/documents/${doc.id}`, { method: "DELETE" });
      setItems((prev) => prev.filter((d) => d.id !== doc.id));
      if (viewer?.id === doc.id) setViewer(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete.");
    }
  }

  return (
    <div>
      <PageHeader
        title="Documents"
        subtitle="Notes, PYQs, syllabus & more"
        action={
          <button className="btn-primary" onClick={() => setModalOpen(true)}>
            + Upload
          </button>
        }
      />

      {/* Category filter */}
      <div className="flex gap-2 mb-5 overflow-x-auto scrollbar-thin -mx-1 px-1">
        {CATEGORIES.map((c) => (
          <button
            key={c}
            onClick={() => setFilter(c)}
            className={classNames(
              "rounded-full px-3.5 py-1.5 text-xs font-medium border transition-colors whitespace-nowrap",
              filter === c
                ? "bg-brand-600 text-white border-brand-600"
                : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-brand-300"
            )}
          >
            {c}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-900/30 px-4 py-2 text-sm text-rose-700 dark:text-rose-200">
          {error}
        </div>
      )}

      {/* Grid */}
      {loading ? (
        <SkeletonGrid />
      ) : items.length === 0 ? (
        <EmptyState onUpload={() => setModalOpen(true)} />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {items.map((d) => (
            <DocumentCard
              key={d.id}
              doc={d}
              onOpen={() => setViewer(d)}
              onDelete={() => onDelete(d)}
            />
          ))}
        </div>
      )}

      <UploadModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onUploaded={onUploaded}
      />

      <Viewer
        doc={viewer}
        onClose={() => setViewer(null)}
        onDelete={() => viewer && onDelete(viewer)}
      />
    </div>
  );
}

function DocumentCard({
  doc,
  onOpen,
  onDelete,
}: {
  doc: Document;
  onOpen: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="card p-4 group cursor-pointer hover:shadow-soft transition-shadow" onClick={onOpen}>
      <div className="flex items-start gap-3">
        <div className="grid place-items-center h-10 w-10 rounded-xl bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-300 shrink-0">
          {doc.mimeType === "application/pdf" ? <PdfIcon /> : <ImageIcon />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium truncate" title={doc.title}>
            {doc.title}
          </p>
          <p className="text-xs text-slate-400 truncate" title={doc.originalName}>
            {doc.originalName}
          </p>
          <div className="mt-2 flex items-center gap-2 text-[11px] text-slate-500">
            <span className="badge bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
              {doc.category}
            </span>
            <IndexBadge doc={doc} />
            <span>{humanSize(doc.sizeBytes)}</span>
            <span>·</span>
            <span>{relativeTime(new Date(doc.createdAt))}</span>
          </div>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-rose-500 transition-opacity p-1 -m-1"
          aria-label="Delete"
          title="Delete"
        >
          <TrashIcon />
        </button>
      </div>
    </div>
  );
}

function UploadModal({
  open,
  onClose,
  onUploaded,
}: {
  open: boolean;
  onClose: () => void;
  onUploaded: (d: Document) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<string>("Notes");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function reset() {
    setFile(null);
    setTitle("");
    setCategory("Notes");
    setError(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function close() {
    reset();
    onClose();
  }

  function onPick(f: File | null) {
    setError(null);
    if (!f) {
      setFile(null);
      return;
    }
    if (!ALLOWED_MIME.includes(f.type)) {
      setError("Only PDF, PNG, JPG, and WEBP files are allowed.");
      return;
    }
    if (f.size > MAX_SIZE) {
      setError(`File is too large (${humanSize(f.size)}). Max is 20 MB.`);
      return;
    }
    setFile(f);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file || submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("title", title.trim());
      fd.append("category", category);
      // apiFetch defaults content-type to JSON, which would break multipart.
      // Use fetch directly here so the browser sets the right boundary.
      const res = await fetch("/api/documents", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((data as { error?: string }).error || "Upload failed");
      }
      onUploaded((data as { document: Document }).document);
      reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={close} title="Upload a document">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="label">File</label>
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf,image/png,image/jpeg,image/webp"
            onChange={(e) => onPick(e.target.files?.[0] || null)}
            className="block w-full text-sm text-slate-600 dark:text-slate-300 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-medium file:bg-brand-50 file:text-brand-700 hover:file:bg-brand-100 dark:file:bg-brand-900/40 dark:file:text-brand-200"
          />
          {file && (
            <p className="text-xs text-slate-400 mt-2">
              {file.name} · {humanSize(file.size)}
            </p>
          )}
        </div>

        <div>
          <label className="label">Title (optional)</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
            placeholder={
              file ? file.name.replace(/\.[^.]+$/, "") : "e.g. DSA Unit 3 notes"
            }
            className="input"
          />
        </div>

        <div>
          <label className="label">Category</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="input"
          >
            {(["Notes", "PYQ", "Syllabus", "Marksheet", "Other"] as const).map(
              (c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              )
            )}
          </select>
        </div>

        {error && (
          <div className="rounded-xl border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-900/30 px-3 py-2 text-sm text-rose-700 dark:text-rose-200">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={close} className="btn-ghost">
            Cancel
          </button>
          <button type="submit" disabled={!file || submitting} className="btn-primary">
            {submitting ? "Uploading…" : "Upload"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function Viewer({
  doc,
  onClose,
  onDelete,
}: {
  doc: Document | null;
  onClose: () => void;
  onDelete: () => void;
}) {
  if (!doc) return null;
  const src = `/api/documents/${doc.id}/file`;
  const isPdf = doc.mimeType === "application/pdf";

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="absolute top-0 right-0 h-full w-full sm:max-w-2xl bg-white dark:bg-slate-900 shadow-soft flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-100 dark:border-slate-800">
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate" title={doc.title}>
              {doc.title}
            </p>
            <p className="text-xs text-slate-400 truncate">{doc.originalName}</p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 text-2xl leading-none -mt-1"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Preview */}
        <div className="flex-1 bg-slate-100 dark:bg-slate-950 overflow-auto">
          {isPdf ? (
            <iframe
              src={`${src}#toolbar=0`}
              title={doc.title}
              className="w-full h-full min-h-[60vh]"
            />
          ) : (
            <div className="p-4 flex items-center justify-center min-h-[60vh]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={src}
                alt={doc.title}
                className="max-w-full max-h-[70vh] rounded-lg shadow"
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500">
          <div className="flex items-center gap-3">
            <span className="badge bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
              {doc.category}
            </span>
            <span>{humanSize(doc.sizeBytes)}</span>
            <span>·</span>
            <span>Uploaded {relativeTime(new Date(doc.createdAt))}</span>
          </div>
          <div className="flex items-center gap-2">
            <a
              href={src}
              target="_blank"
              rel="noreferrer"
              className="btn-ghost px-3 py-1.5 text-xs"
            >
              Open in new tab
            </a>
            <button onClick={onDelete} className="btn-danger px-3 py-1.5 text-xs">
              Delete
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ onUpload }: { onUpload: () => void }) {
  return (
    <div className="card p-10 text-center">
      <div className="inline-grid place-items-center h-14 w-14 rounded-2xl bg-brand-100 dark:bg-brand-900/40 text-brand-700 dark:text-brand-200 text-2xl mb-4">
        📄
      </div>
      <h2 className="text-lg font-semibold tracking-tight">No documents yet</h2>
      <p className="text-sm text-slate-500 mt-1 max-w-sm mx-auto">
        Upload notes, PYQs, your syllabus, or marksheets. Everything stays on
        your account — nothing shared, nothing public.
      </p>
      <button onClick={onUpload} className="btn-primary mt-5">
        Upload your first document
      </button>
    </div>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="card p-4 animate-pulse">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-xl bg-slate-200 dark:bg-slate-800" />
            <div className="flex-1 space-y-2">
              <div className="h-3.5 w-2/3 rounded bg-slate-200 dark:bg-slate-800" />
              <div className="h-3 w-1/2 rounded bg-slate-200 dark:bg-slate-800" />
              <div className="h-3 w-1/3 rounded bg-slate-200 dark:bg-slate-800" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function humanSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  const fixed = n < 10 && i > 0 ? n.toFixed(1) : Math.round(n).toString();
  return `${fixed} ${units[i]}`;
}

// §21 — RAG index status badge. Four states mirror the document
// indexer's outcomes. Kept tiny — the card is already busy.
function IndexBadge({ doc }: { doc: Document }) {
  if (doc.chunkCount > 0) {
    return (
      <span
        className="badge bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-200"
        title="Indexed for Ask My College"
      >
        Indexed · {doc.chunkCount} chunks
      </span>
    );
  }
  if (doc.chunkCount === -1) {
    return (
      <span
        className="badge bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-200"
        title={doc.indexError ?? "Indexing failed"}
      >
        Index failed
      </span>
    );
  }
  if (doc.chunkCount === 0 && doc.indexedAt) {
    return (
      <span
        className="badge bg-slate-100 dark:bg-slate-800 text-slate-500"
        title={doc.indexError ?? "No text could be extracted from this file."}
      >
        No text
      </span>
    );
  }
  return (
    <span
      className="badge bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-200"
      title="Indexing in progress"
    >
      Indexing…
    </span>
  );
}

function PdfIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
      <path d="M6 3h9l4 4v14H6z" strokeLinejoin="round" />
      <path d="M14 3v5h5" strokeLinejoin="round" />
      <path d="M9 14h1.5a1.5 1.5 0 0 1 0 3H9zm0 0v5M13 14h2M13 16.5h1.5M13 19h2" strokeLinecap="round" />
    </svg>
  );
}
function ImageIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <circle cx="9" cy="10" r="1.5" />
      <path d="m4 17 5-5 4 4 3-3 4 4" strokeLinejoin="round" />
    </svg>
  );
}
function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
      <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
