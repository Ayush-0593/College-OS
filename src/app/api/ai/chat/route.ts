// §12 + §27 — "Ask My College" chat endpoint.
//
// Flow:
//   1. Auth → userId
//   2. Receive { conversationId?, message }.
//   3. Resolve or create the AiConversation row.
//   4. Pull prior turns (last N) for context.
//   5. Run controlled retrieval against the user's question.
//   6. Build system prompt from retrieval result.
//   7. Call Anthropic → reply.
//   8. Persist both messages with intent + contextKeys (the §27 audit trail).
//
// We do NOT pass the raw DB rows, only the text that retrieval() formatted.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, jsonError } from "@/lib/requireUser";
import { retrieve } from "@/lib/ai/retrieve";
import { buildSystemPrompt, buildEmptyStatePrompt } from "@/lib/ai/prompt";
import { chat, isAiConfigured, type ChatTurn } from "@/lib/ai/client";

const MAX_HISTORY = 10; // last N user/assistant turns to keep as context
const MAX_MESSAGE_LEN = 2000;

export async function POST(req: NextRequest) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { userId } = auth.ctx;

  // Body validation happens BEFORE the configured-check, so a malformed
  // request always returns 400 — not a misleading 503.
  const body = await req.json().catch(() => null);
  if (!body) return jsonError("Invalid JSON body.");

  const message = String(body.message || "").trim();
  if (!message) return jsonError("Message is required.");
  if (message.length > MAX_MESSAGE_LEN) {
    return jsonError(`Message too long (max ${MAX_MESSAGE_LEN} characters).`);
  }

  if (!isAiConfigured()) {
    return jsonError(
      "AI is not configured on the server (ANTHROPIC_API_KEY missing).",
      503
    );
  }

  const conversationId: string | undefined =
    typeof body.conversationId === "string" && body.conversationId.length > 0
      ? body.conversationId
      : undefined;

  // Resolve or create the conversation. We always scope to userId so a
  // caller can never read or append to someone else's conversation.
  let convo;
  if (conversationId) {
    convo = await prisma.aiConversation.findFirst({
      where: { id: conversationId, userId },
    });
    if (!convo) return jsonError("Conversation not found.", 404);
  } else {
    convo = await prisma.aiConversation.create({
      data: {
        userId,
        title: titleFromMessage(message),
      },
    });
  }

  // Pull the recent history for multi-turn context.
  const history = await prisma.aiMessage.findMany({
    where: { conversationId: convo.id },
    orderBy: { createdAt: "asc" },
    take: 200, // hard ceiling, then we'll trim
  });
  const trimmed = history.slice(-MAX_HISTORY);
  const turns: ChatTurn[] = trimmed.map((m) => ({
    role: m.role === "assistant" ? "assistant" : "user",
    content: m.content,
  }));

  // §27 controlled retrieval. This is the only place that touches the
  // user's data for this request.
  const retrieval = await retrieve(userId, message);

  const system = retrieval.empty
    ? buildEmptyStatePrompt()
    : buildSystemPrompt(retrieval);

  let reply: string;
  try {
    reply = await chat({
      system,
      messages: [...turns, { role: "user", content: message }],
    });
  } catch (err) {
    console.error("[/api/ai/chat] anthropic error", err);
    return jsonError(
      "The AI service is temporarily unavailable. Please try again.",
      502
    );
  }

  if (!reply) {
    return jsonError("The AI returned an empty response.", 502);
  }

  // §21 — Lift the documents slice out of the retrieval result so the
  // client can render an expandable citation under the assistant bubble.
  // We don't persist this on AiMessage (it's a transient retrieval hint,
  // not part of the §27 audit trail).
  const docSlice = retrieval.slices.find((s) => s.key === "documents.context");
  const citations: Array<{
    documentId: string;
    title: string;
    text: string;
    score: number;
  }> = Array.isArray(docSlice?.data)
    ? (docSlice!.data as Array<{
        documentId: string;
        title: string;
        text: string;
        score: number;
      }>)
    : [];

  // Persist both messages, including the audit trail fields.
  await prisma.$transaction([
    prisma.aiMessage.create({
      data: {
        conversationId: convo.id,
        role: "user",
        content: message,
        intent: retrieval.intent,
        contextKeys: JSON.stringify(retrieval.keys),
      },
    }),
    prisma.aiMessage.create({
      data: {
        conversationId: convo.id,
        role: "assistant",
        content: reply,
        intent: retrieval.intent,
        contextKeys: JSON.stringify(retrieval.keys),
      },
    }),
    prisma.aiConversation.update({
      where: { id: convo.id },
      data: { updatedAt: new Date() },
    }),
  ]);

  return NextResponse.json({
    conversationId: convo.id,
    message: reply,
    intent: retrieval.intent,
    contextKeys: retrieval.keys,
    citations,
  });
}

function titleFromMessage(s: string): string {
  // Truncate, strip newlines, cap at 60 chars for a clean conversation list.
  const flat = s.replace(/\s+/g, " ").trim();
  return flat.length > 60 ? flat.slice(0, 57) + "…" : flat;
}
