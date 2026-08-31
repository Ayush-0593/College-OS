// Minimal ambient declaration for `pdf-parse` (no upstream types).
// We only call its default export with a Buffer; the response shape we
// actually use is { text: string }.

declare module "pdf-parse" {
  interface PdfParseResult {
    text: string;
    numpages?: number;
    info?: Record<string, unknown>;
  }
  function pdfParse(data: Buffer): Promise<PdfParseResult>;
  export default pdfParse;
}
