// §11 — Document Vault: list + upload.
//
// GET  /api/documents[?category=PYQ]   list the caller's documents (metadata only)
// POST /api/documents                  multipart upload, validates, writes file,
//                                      creates the row, cleans up the file if
//                                      the DB write fails.

import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { requireUser, jsonError } from "@/lib/requireUser";
import {
  assertUpload,
  CATEGORIES,
  deleteFileSafe,
  pickExt,
  UploadError,
  userDir,
} from "@/lib/documents";
import { indexDocument } from "@/lib/documents/index";

export async function GET(req: NextRequest) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { userId } = auth.ctx;

  const category = req.nextUrl.searchParams.get("category");
  const where: { userId: string; category?: string } = { userId };
  if (category && (CATEGORIES as readonly string[]).includes(category)) {
    where.category = category;
  }

  const documents = await prisma.document.findMany({
    where,
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ documents });
}

export async function POST(req: NextRequest) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { userId } = auth.ctx;

  // Parse multipart. Next 14's req.formData() works for the standard
  // multipart/form-data with a single 'file' part plus text fields.
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return jsonError("Expected multipart/form-data with a 'file' field.");
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return jsonError("No file uploaded. Use a 'file' field in form-data.");
  }

  let parsed: { type: string; size: number; name: string };
  try {
    assertUpload({ type: file.type, size: file.size, name: file.name });
    parsed = { type: file.type, size: file.size, name: file.name };
  } catch (err) {
    if (err instanceof UploadError) return jsonError(err.message);
    throw err;
  }

  const titleRaw = String(form.get("title") || "").trim();
  const title = titleRaw || stripExt(parsed.name) || "Untitled";

  const categoryRaw = String(form.get("category") || "Notes");
  const category = (CATEGORIES as readonly string[]).includes(categoryRaw)
    ? categoryRaw
    : "Notes";

  // Reserve the row first so we have a stable id to use as the filename.
  // We do it in two steps (create with placeholder path, then rename) so
  // a DB failure leaves no orphan file behind — we only write the file
  // once we know the row exists.
  const draft = await prisma.document.create({
    data: {
      userId,
      title,
      originalName: parsed.name,
      mimeType: parsed.type,
      sizeBytes: parsed.size,
      category,
      storagePath: "", // filled in below
    },
  });

  const ext = pickExt(parsed.type as Parameters<typeof pickExt>[0]);
  const dir = await userDir(userId);
  const finalName = `${draft.id}.${ext}`;
  const finalRel = path.posix.join(userId, finalName);
  const finalAbs = path.join(dir, finalName);

  try {
    const buf = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(finalAbs, buf);
  } catch (err) {
    // If the disk write fails, roll back the row so we don't leave a
    // phantom row pointing at a nonexistent file.
    await prisma.document.delete({ where: { id: draft.id } }).catch(() => {});
    console.error("[/api/documents] write failed", err);
    return jsonError("Could not save the file. Please try again.", 500);
  }

  const document = await prisma.document.update({
    where: { id: draft.id },
    data: { storagePath: finalRel },
  });

  // §21 — Fire-and-forget the RAG indexer. We don't await it because a
  // 20 MB PDF can take 5–10 s to extract + embed; the upload response
  // should not block. The documents page polls for `chunkCount > 0` (or
  // `chunkCount === -1` for failure) to reflect the index state.
  void indexDocument(document.id).catch((err) =>
    console.error("[/api/documents] index kickoff failed", err)
  );

  return NextResponse.json({ document }, { status: 201 });
}

function stripExt(name: string): string {
  const i = name.lastIndexOf(".");
  return i > 0 ? name.slice(0, i) : name;
}

// Keep deleteFileSafe referenced so the import is intentional even though
// it's only used in the [id] route today.
void deleteFileSafe;
