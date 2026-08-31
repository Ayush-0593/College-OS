// §11 — Stream a document's bytes to the browser.
//
// Auth-scoped, so one user can never fetch another user's file even if
// they know the document id. Sends Content-Disposition: inline so the
// browser opens the PDF/image in-place rather than triggering a download.

import { NextRequest } from "next/server";
import { promises as fs, createReadStream } from "node:fs";
import { Readable } from "node:stream";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { requireUser, jsonError } from "@/lib/requireUser";
import { absolutePath, mimeFromExt } from "@/lib/documents";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { userId } = auth.ctx;

  const document = await prisma.document.findFirst({
    where: { id: params.id, userId },
  });
  if (!document || !document.storagePath) {
    return jsonError("Document not found.", 404);
  }

  // Trust the row's mimeType, but cross-check against the on-disk
  // extension as a defence-in-depth measure.
  const ext = path.extname(document.storagePath).slice(1);
  const fromExt = mimeFromExt(ext);
  const mimeType = fromExt || document.mimeType || "application/octet-stream";

  // Inline disposition with a sanitized filename. Rejecting control chars
  // and quotes is the minimum — we'll let the browser handle the rest.
  const safeName = sanitizeFilename(document.originalName || document.title);

  const filePath = absolutePath(document.storagePath);
  let stat;
  try {
    stat = await fs.stat(filePath);
  } catch {
    return jsonError("File is missing on the server.", 410);
  }

  // Convert the Node stream into a Web ReadableStream so Next can pipe it
  // straight to the response body.
  const nodeStream = createReadStream(filePath);
  const webStream = Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;

  return new Response(webStream, {
    status: 200,
    headers: {
      "content-type": mimeType,
      "content-length": String(stat.size),
      "content-disposition": `inline; filename="${safeName}"`,
      "cache-control": "private, max-age=0, must-revalidate",
    },
  });
}

function sanitizeFilename(name: string): string {
  // Strip path separators and control chars. Fall back to a generic name
  // if the result is empty.
  const cleaned = name.replace(/[\r\n\t"\\\/]/g, "_").trim();
  return cleaned.length > 0 ? cleaned : "document";
}
