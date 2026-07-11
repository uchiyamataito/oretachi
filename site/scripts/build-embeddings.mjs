// オレタチ RAG 埋め込み生成（Phase C／doc42§5・doc45 H-1/M-5/M-7）
// rag_chunks.json の各チャンクを、日本語対応の埋め込みモデルでベクトル化し rag_embeddings.json を作る。
// Cloudflare Workers AI の REST を叩くだけ＝無料枠。ANTHROPIC は使わない（Claude課金は発生しない）。
//
// 必要な環境変数（内山さんが Cloudflare で発行・無料）：
//   CF_ACCOUNT_ID … Cloudflare のアカウントID
//   CF_API_TOKEN  … Workers AI 実行権限付きの API トークン
//   EMBED_MODEL   … 任意。既定 @cf/baai/bge-m3（多言語・日本語対応・1024次元）
//                   ※ Worker(functions/api/chat.ts) の EMBED_MODEL と"必ず同一"にすること（M-5＝次元一致）
//
// 実行： CF_ACCOUNT_ID=xxx CF_API_TOKEN=yyy node scripts/build-embeddings.mjs
//   ・hash が前回と同じチャンクは再埋め込みしない（ragChunk.mjs の内容フィンガープリントを利用＝安く回る）
//   ・build/query でモデルが違うと RAG が壊れるため、次元不一致を検出したら中断する

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, '..', 'src', 'data');
const CHUNKS_PATH = join(DATA, 'rag_chunks.json');
// 出力は public/ 配下（静的アセットとして /rag_embeddings.json で配信し、Worker が実行時に読む）。
// Worker へ同梱すると数MBでサイズ上限を超えるため。
const OUT_PATH = join(__dirname, '..', 'public', 'rag_embeddings.json');

const MODEL = process.env.EMBED_MODEL || '@cf/baai/bge-m3';
const ACCOUNT = process.env.CF_ACCOUNT_ID;
const TOKEN = process.env.CF_API_TOKEN;
const BATCH = 50;

if (!ACCOUNT || !TOKEN) {
  console.error('✗ CF_ACCOUNT_ID と CF_API_TOKEN が必要です（Cloudflare・無料枠）。設定して再実行してください。');
  process.exit(1);
}
if (!existsSync(CHUNKS_PATH)) {
  console.error(`✗ ${CHUNKS_PATH} がありません。先に npm run build:rag を実行してください。`);
  process.exit(1);
}

const chunks = JSON.parse(readFileSync(CHUNKS_PATH, 'utf-8'));
// 既存の埋め込みを hash キャッシュとして読む（内容が変わっていない塊は再生成しない）
const prev = existsSync(OUT_PATH) ? JSON.parse(readFileSync(OUT_PATH, 'utf-8')) : [];
const prevByKey = new Map(prev.map((r) => [`${r.id}:${r.hash}`, r.embedding]));

async function embedBatch(texts) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/ai/run/${MODEL}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify({ text: texts }),
  });
  if (!res.ok) throw new Error(`Workers AI ${res.status}: ${await res.text()}`);
  const j = await res.json();
  const data = j?.result?.data;
  if (!Array.isArray(data) || data.length !== texts.length) throw new Error('埋め込みレスポンスの形が想定外です（要一次確認）');
  return data;
}

const out = [];
let reused = 0;
let embedded = 0;
let dim = null;

for (let i = 0; i < chunks.length; i += BATCH) {
  const slice = chunks.slice(i, i + BATCH);
  const need = [];
  const needIdx = [];
  // まずキャッシュを引く
  for (let k = 0; k < slice.length; k++) {
    const c = slice[k];
    const cached = prevByKey.get(`${c.id}:${c.hash}`);
    if (cached) { slice[k]._emb = cached; reused++; }
    else { need.push(c.text); needIdx.push(k); }
  }
  // 足りない分だけ生成
  if (need.length) {
    const vecs = await embedBatch(need);
    needIdx.forEach((k, n) => { slice[k]._emb = vecs[n]; embedded++; });
  }
  for (const c of slice) {
    const emb = c._emb;
    if (!Array.isArray(emb)) throw new Error(`埋め込み取得に失敗: ${c.id}`);
    // 次元一致の検証（M-5）：全チャンクが同一次元でなければ中断（build/query のモデル不一致事故を防ぐ）
    if (dim === null) dim = emb.length;
    else if (emb.length !== dim) throw new Error(`次元不一致: ${c.id} が ${emb.length}、他は ${dim}。同一モデルで生成してください。`);
    out.push({
      id: c.id, hash: c.hash, url: c.url, title: c.title,
      category: c.category, heading: c.heading, text: c.text, image: c.image || '',
      embedding: emb.map((v) => Number(v.toFixed(6))), // ファイルサイズ圧縮（精度は検索に十分）
    });
  }
  process.stdout.write(`\r  進捗 ${Math.min(i + BATCH, chunks.length)}/${chunks.length}`);
}

writeFileSync(OUT_PATH, JSON.stringify(out));
console.log(`\n✓ ${out.length}件を書き出し（再利用 ${reused} / 新規 ${embedded}）。モデル=${MODEL}・次元=${dim}`);
console.log(`  → functions/api/chat.ts の EMBED_MODEL も "${MODEL}"（同一）にすること（M-5）。`);
