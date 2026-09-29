import { env } from "./env";

// Cohere embed-v4.0: asymmetric embeddings (documents vs queries), 1024 dims.
// Rerank-v3.5 for the second pass on text queries.
const EMBED_MODEL = process.env.COHERE_EMBED_MODEL || "embed-v4.0";
const RERANK_MODEL = process.env.COHERE_RERANK_MODEL || "rerank-v3.5";
export const EMBED_DIMS = 1024;

async function call<T>(path: string, body: unknown, timeoutMs = 8000): Promise<T | null> {
  if (!env.COHERE_API_KEY) return null;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch("https://api.cohere.com/v2" + path, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.COHERE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      console.error("cohere", path, res.status, (await res.text()).slice(0, 300));
      return null;
    }
    return (await res.json()) as T;
  } catch (e) {
    console.error("cohere", path, (e as Error).message);
    return null;
  } finally {
    clearTimeout(t);
  }
}

type EmbedResponse = { embeddings: { float: number[][] } };

export async function embedDocuments(texts: string[]): Promise<(number[] | null)[]> {
  if (texts.length === 0) return [];
  const r = await call<EmbedResponse>("/embed", {
    model: EMBED_MODEL,
    texts: texts.map((t) => t.slice(0, 6000)),
    input_type: "search_document",
    embedding_types: ["float"],
    output_dimension: EMBED_DIMS,
  });
  if (!r) return texts.map(() => null);
  return r.embeddings.float;
}

export async function embedQuery(text: string): Promise<number[] | null> {
  const r = await call<EmbedResponse>("/embed", {
    model: EMBED_MODEL,
    texts: [text.slice(0, 2000)],
    input_type: "search_query",
    embedding_types: ["float"],
    output_dimension: EMBED_DIMS,
  }, 5000);
  return r?.embeddings.float[0] ?? null;
}

type RerankResponse = { results: { index: number; relevance_score: number }[] };

/** Returns indices into `docs` in ranked order with scores, or null if reranking is unavailable. */
export async function rerank(query: string, docs: string[], topN: number): Promise<{ index: number; score: number }[] | null> {
  if (docs.length === 0) return [];
  const r = await call<RerankResponse>("/rerank", {
    model: RERANK_MODEL,
    query: query.slice(0, 1000),
    documents: docs.map((d) => d.slice(0, 4000)),
    top_n: Math.min(topN, docs.length),
  }, 6000);
  if (!r) return null;
  return r.results.map((x) => ({ index: x.index, score: x.relevance_score }));
}

/** The text we embed for a post: title, tags, place and body, in that order. */
export function postEmbeddingText(p: { title: string; body: string; tags: string[]; place_name?: string | null; kind: string }): string {
  const parts = [p.kind + ": " + p.title];
  if (p.tags.length) parts.push("tags: " + p.tags.join(", "));
  if (p.place_name) parts.push("where: " + p.place_name);
  parts.push(p.body);
  return parts.join("\n");
}
