"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch, classNames } from "@/components/client-utils";

// §12 — "Ask My College" AI page.
// Server-rendered conversation list would be nicer, but the chat is fully
// client-driven and the conversation list updates after every send, so we
// keep it all in one client component for v1.

interface Conversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  _count: { messages: number };
}

// §21 — A citation is one chunk that the AI saw while answering. Surfaced
// under the assistant bubble as an expandable "From <title>" card with the
// matched paragraph and a link to open the source document.
interface Citation {
  documentId: string;
  title: string;
  text: string;
  score: number;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  intent?: string | null;
  contextKeys?: string | null;
  citations?: Citation[];
  createdAt: string;
}

const SUGGESTIONS = [
  "What's my class tomorrow?",
  "What assignments are due this week?",
  "When is my next exam?",
  "How is my attendance?",
  "Any new notices?",
];

export default function AiPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiReady, setAiReady] = useState<boolean | null>(null); // null = unknown
  const [drawerOpen, setDrawerOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const loadConversations = useCallback(async () => {
    try {
      const data = await apiFetch<{ conversations: Conversation[] }>(
        "/api/ai/conversations"
      );
      setConversations(data.conversations);
    } catch {
      // non-fatal; list is decorative
    }
  }, []);

  // §19 — probe the actual AI-ready state. The /api/ai/status endpoint reads
  // process.env.ANTHROPIC_API_KEY server-side; this is the only signal that
  // reflects whether the AI will actually respond.
  useEffect(() => {
    (async () => {
      try {
        const [convos, status] = await Promise.all([
          apiFetch<{ conversations: Conversation[] }>("/api/ai/conversations"),
          apiFetch<{ configured: boolean }>("/api/ai/status"),
        ]);
        setConversations(convos.conversations);
        setAiReady(status.configured);
      } catch {
        setAiReady(false);
      }
    })();
  }, []);

  // Load messages for the active conversation
  useEffect(() => {
    if (!activeId) {
      setMessages([]);
      return;
    }
    (async () => {
      try {
        const data = await apiFetch<{ conversation: { messages: Message[] } }>(
          `/api/ai/conversations/${activeId}`
        );
        setMessages(data.conversation.messages);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load.");
      }
    })();
  }, [activeId]);

  // Auto-scroll on new messages
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, sending]);

  async function send(text: string) {
    const msg = text.trim();
    if (!msg || sending) return;
    setError(null);
    setInput("");

    // Optimistic user bubble
    const tempId = `tmp-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      {
        id: tempId,
        role: "user",
        content: msg,
        createdAt: new Date().toISOString(),
      },
    ]);
    setSending(true);

    try {
      const res = await apiFetch<{
        conversationId: string;
        message: string;
        intent: string;
        contextKeys: string[];
        citations?: Citation[];
      }>("/api/ai/chat", {
        method: "POST",
        body: JSON.stringify({ message: msg, conversationId: activeId }),
      });

      // First reply establishes a conversation
      if (!activeId) setActiveId(res.conversationId);

      // Replace the optimistic user bubble + append the assistant reply.
      // We don't have the real DB id for the user bubble, so we re-fetch
      // the conversation to stay consistent with the audit trail.
      try {
        const refreshed = await apiFetch<{
          conversation: { messages: Message[] };
        }>(`/api/ai/conversations/${res.conversationId}`);
        setMessages(refreshed.conversation.messages);
      } catch {
        // Fall back: append the assistant reply inline if the re-fetch fails.
        setMessages((prev) => [
          ...prev,
          {
            id: `tmp-a-${Date.now()}`,
            role: "assistant",
            content: res.message,
            intent: res.intent,
            contextKeys: JSON.stringify(res.contextKeys),
            citations: res.citations ?? [],
            createdAt: new Date().toISOString(),
          },
        ]);
      }
      // If the re-fetch succeeded, the persisted messages come back
      // without `citations` (we don't store them on AiMessage). Re-merge
      // the citations onto the assistant message we just inserted.
      setMessages((prev) =>
        prev.map((m) =>
          m.role === "assistant" &&
          m.content === res.message &&
          (!m.citations || m.citations.length === 0) &&
          (res.citations?.length ?? 0) > 0
            ? { ...m, citations: res.citations }
            : m
        )
      );
      await loadConversations();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not send.";
      setError(message);
      // Roll back the optimistic user bubble on failure.
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setInput(msg);
    } finally {
      setSending(false);
    }
  }

  function startNew() {
    setActiveId(null);
    setMessages([]);
    setError(null);
    setDrawerOpen(false);
  }

  async function deleteConvo(id: string) {
    try {
      await apiFetch(`/api/ai/conversations/${id}`, { method: "DELETE" });
      if (activeId === id) startNew();
      await loadConversations();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete.");
    }
  }

  function pickSuggestion(s: string) {
    setInput(s);
    // auto-send so the demo flow stays one tap
    void send(s);
  }

  return (
    <div className="flex h-[calc(100vh-3rem)] md:h-[calc(100vh-3rem)] -mx-4 sm:-mx-6 lg:-mx-8 -my-6">
      {/* Sidebar */}
      <aside
        className={classNames(
          "fixed md:static inset-y-0 left-0 z-30 w-72 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col transition-transform",
          drawerOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        )}
      >
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="grid place-items-center h-8 w-8 rounded-xl bg-brand-600 text-white text-sm font-bold">
              ✦
            </span>
            <div>
              <p className="text-sm font-semibold">Ask My College</p>
              <p className="text-xs text-slate-400">Your private study AI</p>
            </div>
          </div>
          <button
            onClick={() => setDrawerOpen(false)}
            className="md:hidden btn-ghost px-2 py-1 text-xs"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <div className="p-3">
          <button
            onClick={startNew}
            className="btn-primary w-full"
            disabled={sending}
          >
            + New chat
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-2 pb-3 scrollbar-thin">
          {conversations.length === 0 ? (
            <p className="text-xs text-slate-400 px-3 py-6 text-center">
              No conversations yet. Ask anything to get started.
            </p>
          ) : (
            conversations.map((c) => (
              <div
                key={c.id}
                className={classNames(
                  "group flex items-center gap-1 rounded-xl px-2 py-2 cursor-pointer text-sm",
                  activeId === c.id
                    ? "bg-brand-50 dark:bg-brand-900/40 text-brand-700 dark:text-brand-200"
                    : "hover:bg-slate-100 dark:hover:bg-slate-800"
                )}
                onClick={() => {
                  setActiveId(c.id);
                  setDrawerOpen(false);
                }}
              >
                <span className="flex-1 truncate">{c.title}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    void deleteConvo(c.id);
                  }}
                  className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-rose-500 transition-opacity text-xs px-1"
                  aria-label="Delete conversation"
                  title="Delete"
                >
                  ✕
                </button>
              </div>
            ))
          )}
        </div>
      </aside>

      {/* Drawer overlay on mobile */}
      {drawerOpen && (
        <div
          className="md:hidden fixed inset-0 z-20 bg-black/30"
          onClick={() => setDrawerOpen(false)}
        />
      )}

      {/* Chat */}
      <div className="flex-1 flex flex-col bg-slate-50 dark:bg-slate-950 min-w-0">
        {/* Top bar */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={() => setDrawerOpen(true)}
              className="md:hidden btn-ghost px-2 py-1 text-xs"
              aria-label="Open chats"
            >
              ☰
            </button>
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate">
                {activeId
                  ? conversations.find((c) => c.id === activeId)?.title ||
                    "Chat"
                  : "Ask My College"}
              </p>
              <p className="text-xs text-slate-400">
                Answers only from your data
              </p>
            </div>
          </div>
        </div>

        {/* Thread */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-4 sm:px-6 py-6 scrollbar-thin"
        >
          {messages.length === 0 ? (
            <EmptyState onPick={pickSuggestion} />
          ) : (
            <div className="max-w-3xl mx-auto space-y-4">
              {messages.map((m) => (
                <Bubble key={m.id} message={m} />
              ))}
              {sending && <TypingBubble />}
            </div>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="px-4 sm:px-6 pb-2">
            <div className="max-w-3xl mx-auto rounded-xl border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-900/30 px-4 py-2 text-sm text-rose-700 dark:text-rose-200">
              {error}
            </div>
          </div>
        )}

        {/* §19 — AI-not-configured banner */}
        {aiReady === false && (
          <div className="px-4 sm:px-6 pb-2">
            <div className="max-w-3xl mx-auto rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/30 px-4 py-2 text-sm text-amber-700 dark:text-amber-200">
              AI is not configured on this server. Set{" "}
              <code className="font-mono text-xs">ANTHROPIC_API_KEY</code> in{" "}
              <code className="font-mono text-xs">.env</code> to enable it.
            </div>
          </div>
        )}

        {/* Composer */}
        <div className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 sm:px-6 py-3">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send(input);
            }}
            className="max-w-3xl mx-auto flex items-end gap-2"
          >
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                // Enter → send. Shift+Enter / Cmd+Enter / Ctrl+Enter → newline.
                if (
                  e.key === "Enter" &&
                  !e.shiftKey &&
                  !e.metaKey &&
                  !e.ctrlKey
                ) {
                  e.preventDefault();
                  void send(input);
                }
              }}
              rows={1}
              maxLength={2000}
              disabled={aiReady === false}
              placeholder={
                aiReady === false
                  ? "AI is not configured…"
                  : "Ask anything about your classes, tasks, exams…"
              }
              className="input resize-none min-h-[42px] max-h-32 flex-1 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={sending || !input.trim() || aiReady === false}
              className="btn-primary h-[42px] px-4"
            >
              {sending ? "…" : "Send"}
            </button>
          </form>
          <p className="max-w-3xl mx-auto mt-2 text-[11px] text-slate-400 text-center">
            Press{" "}
            <kbd className="px-1 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
              Enter
            </kbd>{" "}
            to send,{" "}
            <kbd className="px-1 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
              Shift+Enter
            </kbd>{" "}
            for newline. Ask My College only sees your data.
          </p>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ onPick }: { onPick: (s: string) => void }) {
  return (
    <div className="max-w-3xl mx-auto py-10 text-center">
      <div className="inline-grid place-items-center h-14 w-14 rounded-2xl bg-brand-100 dark:bg-brand-900/40 text-brand-700 dark:text-brand-200 text-2xl mb-4">
        ✦
      </div>
      <h1 className="text-xl font-semibold tracking-tight">
        What do you want to know?
      </h1>
      <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
        Ask about tomorrow's class, upcoming exams, attendance, or anything in
        your data. Pick one to start:
      </p>
      <div className="mt-6 grid sm:grid-cols-2 gap-2 text-left">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            onClick={() => onPick(s)}
            className="card p-3 text-sm hover:border-brand-300 dark:hover:border-brand-700 transition-colors"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

function Bubble({ message }: { message: Message }) {
  const isUser = message.role === "user";
  return (
    <div
      className={classNames(
        "flex",
        isUser ? "justify-end" : "justify-start"
      )}
    >
      <div
        className={classNames(
          "rounded-2xl px-4 py-2.5 max-w-[85%] text-sm whitespace-pre-wrap leading-relaxed shadow-sm",
          isUser
            ? "bg-brand-600 text-white"
            : "bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700"
        )}
      >
        {message.content}
        {!isUser && message.intent && (
          <div className="mt-2 flex flex-wrap gap-1 text-[10px] text-slate-400">
            <span className="badge bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300">
              {message.intent}
            </span>
            {message.contextKeys
              ? safeKeys(message.contextKeys).map((k) => (
                  <span
                    key={k}
                    className="badge bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300"
                  >
                    {k}
                  </span>
                ))
              : null}
          </div>
        )}
        {/* §21 — Citations. Rendered as collapsible details so the bubble
            stays compact when collapsed, and the student can verify the
            source if they want to. */}
        {!isUser && message.citations && message.citations.length > 0 && (
          <div className="mt-2 space-y-1">
            {message.citations.map((c, i) => (
              <details
                key={i}
                className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 text-xs"
              >
                <summary className="cursor-pointer px-2 py-1.5 flex items-center gap-2 text-slate-600 dark:text-slate-300 select-none">
                  <span className="badge bg-brand-100 dark:bg-brand-900/40 text-brand-700 dark:text-brand-200">
                    From
                  </span>
                  <span className="font-medium truncate">{c.title}</span>
                  <span className="ml-auto text-slate-400 tabular-nums">
                    {(c.score * 100).toFixed(0)}%
                  </span>
                </summary>
                <div className="px-2 pb-2 pt-1.5 text-slate-600 dark:text-slate-300 whitespace-pre-wrap border-t border-slate-200 dark:border-slate-700">
                  {c.text}
                  <a
                    href={`/api/documents/${c.documentId}/file`}
                    target="_blank"
                    rel="noreferrer"
                    className="ml-2 inline-block text-brand-600 dark:text-brand-300 underline"
                  >
                    Open
                  </a>
                </div>
              </details>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TypingBubble() {
  return (
    <div className="flex justify-start">
      <div className="rounded-2xl px-4 py-3 bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 text-sm flex items-center gap-1">
        <span className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-bounce" />
        <span
          className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-bounce"
          style={{ animationDelay: "120ms" }}
        />
        <span
          className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-bounce"
          style={{ animationDelay: "240ms" }}
        />
      </div>
    </div>
  );
}

function safeKeys(json: string): string[] {
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}
