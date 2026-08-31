// §21 — Indexer orchestrator. Pulls a document, extracts text, chunks,
// embeds, and writes the DocumentChunk rows. Idempotent: a re-run wipes
// the document's existing chunks before writing the new set.
//
// Called as fire-and-forget from the upload route: the upload response
// should not block on embedding (a 20 MB PDF can take 5–10 s). Failures
// are captured on Document.indexError with chunkCount = -1, surfaced in
// the documents page UI.

import { prisma } from "../prisma";
import { absolutePath } from "../documents";
import { extractText } from "./extract";
import { chunkText } from "./chunk";
import { embedTexts } from "./embed";

export async function indexDocument(documentId: string): Promise<void> {
  const doc = await prisma.document.findUnique({ where: { id: documentId } });
  if (!doc) return;

  try {
    const text = await extractText(absolutePath(doc.storagePath), doc.mimeType);
    const pieces = chunkText(text);

    if (pieces.length === 0) {
      // Indexing succeeded but produced nothing — e.g. image-only PDF, or
      // a file the OCR worker couldn't read. We still mark indexedAt so
      // the UI knows we tried, and surface a human-readable reason in
      // indexError so the "Index failed" badge has a tooltip.
      await prisma.document.update({
        where: { id: documentId },
        data: {
          chunkCount: 0,
          indexedAt: new Date(),
          indexError: text
            ? null
            : "No text could be extracted from this file. If it's a scanned PDF, try re-uploading the pages as images.",
        },
      });
      return;
    }

    const embeddings = await embedTexts(pieces);

    // Wipe + rewrite. deleteMany → createMany in a single transaction so
    // a failure mid-insert leaves the document with its previous chunks
    // (not a half-indexed state).
    await prisma.$transaction([
      prisma.documentChunk.deleteMany({ where: { documentId } }),
      prisma.documentChunk.createMany({
        data: pieces.map((t, i) => ({
          userId: doc.userId,
          documentId: doc.id,
          chunkIndex: i,
          text: t,
          embedding: JSON.stringify(embeddings[i]),
          tokens: Math.ceil(t.length / 4),
        })),
      }),
      prisma.document.update({
        where: { id: documentId },
        data: {
          chunkCount: pieces.length,
          indexedAt: new Date(),
          indexError: null,
        },
      }),
    ]);
  } catch (err) {
    const msg =
      err instanceof Error
        ? err.message.slice(0, 500)
        : "Indexing failed for an unknown reason.";
    // -1 is our "index failed" sentinel; the UI badge reads on it.
    await prisma.document
      .update({
        where: { id: documentId },
        data: { chunkCount: -1, indexError: msg },
      })
      .catch(() => {
        // If the document itself is gone (deleted during indexing), swallow.
      });
  }
}
