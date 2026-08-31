// §21 — Semantic search over the user's DocumentChunks.
//
// Embeds the query (one vector), pulls all of the user's chunks, scores
// each with cosine similarity, returns the top-K. For ≤10K chunks per
// user, brute-force in JS is faster than wiring up sqlite-vss and avoids
// a native build step. If a student ever has 50K+ chunks, swap this for
// pgvector (the schema is the same).

import { prisma } from "../prisma";
import { embedTexts, cosineSim } from "./embed";

export interface SearchHit {
  chunkId: string;
  documentId: string;
  title: string;
  text: string;
  score: number;
}

export async function searchDocuments(
  userId: string,
  query: string,
  k = 3
): Promise<{ chunks: SearchHit[] }> {
  if (!query.trim()) return { chunks: [] };
  const [qVec] = await embedTexts([query]);
  if (!qVec) return { chunks: [] };

  const rows = await prisma.documentChunk.findMany({
    where: { userId },
    include: { document: { select: { title: true } } },
  });
  if (rows.length === 0) return { chunks: [] };

  const scored: { row: (typeof rows)[number]; score: number }[] = [];
  for (const r of rows) {
    let e: number[];
    try {
      e = JSON.parse(r.embedding) as number[];
    } catch {
      // Corrupt row — skip silently. A re-index will fix it.
      continue;
    }
    scored.push({ row: r, score: cosineSim(qVec, e) });
  }
  scored.sort((a, b) => b.score - a.score);

  return {
    chunks: scored.slice(0, k).map((s) => ({
      chunkId: s.row.id,
      documentId: s.row.documentId,
      title: s.row.document.title,
      text: s.row.text,
      score: s.score,
    })),
  };
}
