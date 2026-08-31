// §21 — Chunk a blob of extracted text into ~800-char paragraph-aware
// chunks with a 150-char overlap so a sentence that lands on a boundary
// isn't lost between two chunks.
//
// Why paragraph-aware: most of the student's content is notes/PYQs/syllabi
// with real paragraph structure. Naive 800-char windows split sentences
// mid-clause; paragraph packing keeps each chunk readable on its own.
//
// Why 800/150: tuned for MiniLM-L6-v2's 256-token context window. 800 chars
// ≈ 200 tokens — comfortable headroom, three chunks per page, easy to fit
// ~6 chunks of context plus the question into a 600-token LLM budget.

const TARGET = 800;
const OVERLAP = 150;

export function chunkText(text: string): string[] {
  const cleaned = text
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
  if (!cleaned) return [];

  // Split on blank lines, then collapse intra-paragraph whitespace.
  const paragraphs = cleaned
    .split(/\n{2,}/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let buf = "";
  for (const p of paragraphs) {
    if (!buf) {
      buf = p;
      continue;
    }
    // Will it fit? "+2" is the join cost of "\n\n".
    if (buf.length + 2 + p.length <= TARGET) {
      buf = buf + "\n\n" + p;
    } else {
      chunks.push(buf);
      // Overlap: keep the tail of the previous chunk as a prefix so the
      // current paragraph doesn't start cold. If the overlap is empty (the
      // previous chunk was a single long paragraph), just start fresh.
      const tail = buf.length > OVERLAP ? buf.slice(-OVERLAP) : "";
      buf = tail ? tail + "\n\n" + p : p;
    }
  }
  if (buf) chunks.push(buf);
  return chunks;
}
