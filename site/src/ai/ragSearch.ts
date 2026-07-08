// オレタチ RAG検索（Phase C・純ロジック／doc42§5・doc43§4）
// 埋め込みベクトルのコサイン類似度で、質問に近い chunk を取り出す。
// このモジュールは API を呼ばない＝ベクトルさえあれば ¥0 でテスト可能な純関数。
// 埋め込みの生成（Cloudflare Workers AI）と実データ読込は Worker 側の役目。
// ここは「クエリのベクトル → 近い順の chunk」だけを担い、Worker/ブラウザ両用の同型設計。
//
// テスト実行： node --experimental-strip-types src/ai/ragSearch.test.ts

/** rag_chunks.json のレコード（ragChunk.mjs 由来）＋ Phase C で付与する embedding。 */
export interface EmbeddedChunk {
  id: string;
  url: string;
  title: string;
  category: string;
  heading: string;
  text: string;
  embedding: number[];
}

export interface SearchHit {
  chunk: EmbeddedChunk;
  score: number; // コサイン類似度（-1〜1。1に近いほど近い）
}

export interface SearchOptions {
  /** 取得する最大件数（既定 5）。 */
  topK?: number;
  /** これ未満のスコアは「扱っていない（スコープ外）」として捨てる。実埋め込みで要調整（doc43§13）。 */
  minScore?: number;
}

/** 既定の閾値。実際の埋め込みモデルで最適値は変わるため Worker 側から上書き可能にしておく。 */
export const DEFAULT_TOP_K = 5;
export const DEFAULT_MIN_SCORE = 0.35;

function dot(a: number[], b: number[]): number {
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s;
}

function magnitude(a: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * a[i];
  return Math.sqrt(s);
}

/**
 * コサイン類似度。ゼロベクトル・空配列・長さ不一致は 0（=無関係）に倒す（安全側）。
 * 次元不一致（M-5）＝build時とquery時で埋め込みモデルが違う事故を"それらしい誤スコア"にせず 0 で弾く。
 * 開発時のみ一度だけ警告（本番のログを汚さない）。
 */
let _dimWarned = false;
export function cosineSimilarity(a: number[], b: number[]): number {
  if (!a || !b || a.length === 0 || b.length === 0) return 0;
  if (a.length !== b.length) {
    if (!_dimWarned && typeof console !== 'undefined') {
      console.warn(`[ragSearch] 埋め込み次元が不一致 (${a.length} vs ${b.length})。build と query のモデルが同一か確認してください。`);
      _dimWarned = true;
    }
    return 0;
  }
  const ma = magnitude(a);
  const mb = magnitude(b);
  if (ma === 0 || mb === 0) return 0;
  const c = dot(a, b) / (ma * mb);
  if (!Number.isFinite(c)) return 0;
  return c;
}

/**
 * クエリの埋め込みに近い chunk を、閾値以上・スコア降順で最大 topK 件返す。
 * 1件も閾値を超えなければ空配列＝「扱っていない」（ハルシネーション防止＋回遊へ逃がす）。
 */
export function searchChunks(
  queryEmbedding: number[],
  chunks: EmbeddedChunk[],
  opts: SearchOptions = {},
): SearchHit[] {
  const topK = opts.topK ?? DEFAULT_TOP_K;
  const minScore = opts.minScore ?? DEFAULT_MIN_SCORE;
  return chunks
    .map((chunk) => ({ chunk, score: cosineSimilarity(queryEmbedding, chunk.embedding) }))
    .filter((h) => Number.isFinite(h.score) && h.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

/** ヒットが無い＝スコープ外（この話題は扱っていない）。 */
export function isOutOfScope(hits: SearchHit[]): boolean {
  return hits.length === 0;
}

/** ヒットを記事カード（最大 max 枚）へ。同一記事(url)は1枚に畳む＝doc43§7「最大3カード」。 */
export function hitsToCards(hits: SearchHit[], max = 3): { category: string; title: string; href: string }[] {
  const seen = new Set<string>();
  const cards: { category: string; title: string; href: string }[] = [];
  for (const h of hits) {
    if (seen.has(h.chunk.url)) continue;
    seen.add(h.chunk.url);
    cards.push({ category: h.chunk.category, title: h.chunk.title, href: h.chunk.url });
    if (cards.length >= max) break;
  }
  return cards;
}
