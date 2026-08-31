// §21 — Embedding pipeline (Xenova/all-MiniLM-L6-v2, 384 dims, local).
//
// Why this library: @xenova/transformers runs ONNX models in pure JS+wasm
// inside the Node process. No API key, no per-token cost, ~25 MB model
// cache under node_modules/@xenova/transformers/. Cold first-call takes
// 20–60 s while the model is fetched from the HF CDN; subsequent calls
// are sub-second per chunk.
//
// Why mean-pool + normalize: the model supports CLS pooling, but for short
// retrieval-style snippets mean-pooling is empirically as good or better
// and produces a fixed-length L2-normalized vector — which means cosine
// similarity collapses to a plain dot product.

import type { FeatureExtractionPipeline } from "@xenova/transformers";

export const EMBED_DIM = 384;

let pipelinePromise: Promise<FeatureExtractionPipeline> | null = null;

async function getPipeline(): Promise<FeatureExtractionPipeline> {
  if (!pipelinePromise) {
    pipelinePromise = (async () => {
      const transformers = await import("@xenova/transformers");
      const { env, pipeline } = transformers;
      // We're in Node, not a browser. The defaults assume a browser
      // environment (IndexedDB cache, local model dir), which fails in
      // Next.js's server runtime.
      env.allowLocalModels = false;
      env.useBrowserCache = false;
      // HF model id — Xenova's mirror of sentence-transformers/all-MiniLM-L6-v2
      return pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
    })();
  }
  return pipelinePromise;
}

/**
 * Embed a batch of strings. Returns one L2-normalized number[] per input.
 * Empty input returns []. Throws if the model fails to load.
 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const p = await getPipeline();
  // mean-pool + L2 normalize → out.data is a Float32Array of length
  // texts.length * EMBED_DIM, row-major.
  const out = await p(texts, { pooling: "mean", normalize: true });
  const data = out.data as Float32Array;
  const result: number[][] = [];
  for (let i = 0; i < texts.length; i++) {
    const row: number[] = new Array(EMBED_DIM);
    for (let j = 0; j < EMBED_DIM; j++) {
      row[j] = data[i * EMBED_DIM + j];
    }
    result.push(row);
  }
  return result;
}

/**
 * Cosine similarity for two already-L2-normalized vectors = dot product.
 * We don't pre-check normalization because the embedding pipeline is the
 * only caller and it always normalizes.
 */
export function cosineSim(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length, EMBED_DIM);
  let s = 0;
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s;
}
