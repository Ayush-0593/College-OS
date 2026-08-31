// §21 — Text extraction for the document indexer.
//
// Two paths:
//   - PDF → pdf-parse. Pure JS, reads the file's text streams. Scanned PDFs
//     (no embedded text) return ""; we surface that to the user as "No text
//     could be extracted" rather than failing the index.
//   - Image → tesseract.js. Loads the OCR worker on first use (~15 MB
//     traineddata), runs synchronously, terminates. English (`eng`) only
//     for v1 — adding a language is a one-line change to createWorker.
//
// Both packages are dynamically imported so cold-start of any other route
// in the app doesn't pay the tesseract/transformers load cost.

const OCR_LANG = "eng";

export async function extractText(
  filePath: string,
  mimeType: string
): Promise<string> {
  if (mimeType === "application/pdf") return extractPdf(filePath);
  if (mimeType.startsWith("image/")) return extractImageOcr(filePath);
  // Unknown mime → empty text. We still create a Document row with
  // chunkCount=0 and indexedAt set so the UI shows "No text" rather than
  // spinning forever.
  return "";
}

async function extractPdf(filePath: string): Promise<string> {
  const { promises: fs } = await import("node:fs");
  const buf = await fs.readFile(filePath);
  // pdf-parse's default export needs a Buffer, not a path. We pass the
  // buffer explicitly to avoid the library's debug-mode side effect
  // (which tries to read a test PDF from disk if the path arg fails).
  //
  // We pass the buffer's underlying ArrayBuffer (a fresh, owned copy via
  // `Uint8Array`) because Next's webpack bundle of pdf.js v1.10.100
  // throws "bad XRef entry" when handed a Node Buffer directly — but
  // works fine with the same bytes as a plain Uint8Array. The data
  // round-trips identically; this is a bundler-specific quirk.
  const mod = await import("pdf-parse");
  const pdf = (mod as unknown as { default: (data: Uint8Array) => Promise<{ text: string }> })
    .default;
  const view = new Uint8Array(buf.byteLength);
  view.set(buf);
  const { text } = await pdf(view);
  return text ?? "";
}

async function extractImageOcr(filePath: string): Promise<string> {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker(OCR_LANG);
  try {
    const {
      data: { text },
    } = await worker.recognize(filePath);
    return text ?? "";
  } finally {
    await worker.terminate();
  }
}
