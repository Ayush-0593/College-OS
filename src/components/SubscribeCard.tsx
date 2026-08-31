"use client";

// §22 — Subscribe-in-your-calendar-app card. Shows the webcal:// URL
// (the iOS/Android-native scheme that most calendar clients understand)
// and the https:// URL (for Google Calendar and Outlook web). Each has
// a Copy button that briefly flips to "Copied" via the Clipboard API.

import { useState } from "react";

export function SubscribeCard({
  webcalUrl,
  httpsUrl,
}: {
  webcalUrl: string;
  httpsUrl: string;
}) {
  const [copied, setCopied] = useState<"webcal" | "https" | null>(null);

  async function copy(text: string, kind: "webcal" | "https") {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      // Reset after a beat so the user can copy again if needed.
      setTimeout(() => setCopied((c) => (c === kind ? null : c)), 1500);
    } catch {
      // Clipboard can be unavailable in some embedded contexts. Fall back
      // to selecting the <code> text so the user can copy manually.
      const el = document.querySelector<HTMLElement>(`[data-url-kind="${kind}"]`);
      if (el) {
        const range = document.createRange();
        range.selectNodeContents(el);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
    }
  }

  return (
    <div className="card p-5 space-y-4">
      <div>
        <h2 className="font-semibold">Subscribe in your calendar app</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Copy one of these URLs and add it as a subscribed calendar in iOS
          Calendar, Google Calendar, Outlook, or any RFC 5545 client. Updates
          appear automatically — no re-import needed.
        </p>
      </div>

      <div className="space-y-2">
        <UrlRow
          kind="webcal"
          label="webcal:// (iOS / Android)"
          url={webcalUrl}
          copied={copied === "webcal"}
          onCopy={() => copy(webcalUrl, "webcal")}
        />
        <UrlRow
          kind="https"
          label="https:// (Google / Outlook)"
          url={httpsUrl}
          copied={copied === "https"}
          onCopy={() => copy(httpsUrl, "https")}
        />
      </div>
    </div>
  );
}

function UrlRow({
  kind,
  label,
  url,
  copied,
  onCopy,
}: {
  kind: "webcal" | "https";
  label: string;
  url: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 min-w-0">
        <p className="text-[11px] uppercase tracking-wide text-slate-400 mb-1">
          {label}
        </p>
        <code
          data-url-kind={kind}
          className="block w-full px-3 py-2 rounded-md bg-slate-100 dark:bg-slate-800 text-sm font-mono text-slate-800 dark:text-slate-200 truncate"
        >
          {url}
        </code>
      </div>
      <button
        type="button"
        onClick={onCopy}
        className="btn-ghost shrink-0 mt-5"
        aria-label={`Copy ${kind} URL`}
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
