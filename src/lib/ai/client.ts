// §12 — Anthropic client wrapper.
//
// We keep this thin: the SDK call is one line, but we want one place to
// configure the model + max tokens + the "graceful no-key" behavior so the
// rest of the codebase doesn't have to know about env vars.
//
// If ANTHROPIC_API_KEY is missing we return null and the API route returns a
// 503 with a friendly message — instead of crashing the request.

import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-sonnet-4-5";
const MAX_TOKENS = 600;

let client: Anthropic | null | undefined;

function getClient(): Anthropic | null {
  if (client !== undefined) return client;
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    client = null;
    return null;
  }
  client = new Anthropic({ apiKey: key });
  return client;
}

export function isAiConfigured(): boolean {
  return getClient() !== null;
}

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface ChatOptions {
  system: string;
  messages: ChatTurn[];
  /** Optional override; defaults to the project-wide model. */
  model?: string;
  /** Optional override for the cap on reply length. */
  maxTokens?: number;
}

export async function chat({ system, messages, model, maxTokens }: ChatOptions): Promise<string> {
  const c = getClient();
  if (!c) throw new Error("ANTHROPIC_API_KEY is not configured");

  const resp = await c.messages.create({
    model: model || MODEL,
    max_tokens: maxTokens || MAX_TOKENS,
    system,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
  });

  // The SDK returns content as an array of blocks; for plain text replies
  // we expect a single text block.
  const block = resp.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") return "";
  return block.text.trim();
}
