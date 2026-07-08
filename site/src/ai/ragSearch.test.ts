// ragSearch.ts のユニットテスト（node --experimental-strip-types src/ai/ragSearch.test.ts）
import { cosineSimilarity, searchChunks, isOutOfScope, hitsToCards, type EmbeddedChunk } from './ragSearch.ts';

let pass = 0, fail = 0;
const fails: string[] = [];
function ok(label: string, cond: boolean) { if (cond) pass++; else { fail++; fails.push(`✗ ${label}`); } }
function near(a: number, b: number, eps = 1e-9) { return Math.abs(a - b) < eps; }

// ── cosineSimilarity ──
ok('同一ベクトル=1', near(cosineSimilarity([1, 2, 3], [1, 2, 3]), 1));
ok('直交=0', near(cosineSimilarity([1, 0], [0, 1]), 0));
ok('逆向き=-1', near(cosineSimilarity([1, 0], [-1, 0]), -1));
ok('ゼロベクトルは0（0除算しない）', cosineSimilarity([0, 0], [1, 1]) === 0);
ok('空配列は0', cosineSimilarity([], [1]) === 0);
ok('次元不一致は0（M-5：モデル取り違え事故を弾く）', cosineSimilarity([1, 0, 0, 0], [1, 0, 0]) === 0);

// ── searchChunks ──
const mk = (id: string, url: string, title: string, emb: number[]): EmbeddedChunk =>
  ({ id, url, title, category: 'お金', heading: '見出し', text: '本文', embedding: emb });

const chunks: EmbeddedChunk[] = [
  mk('a', '/a', 'A記事', [1, 0, 0]),
  mk('b', '/b', 'B記事', [0.9, 0.1, 0]),
  mk('c', '/c', 'C記事', [0, 1, 0]),   // 直交（無関係）
  mk('d', '/d', 'D記事', [-1, 0, 0]),  // 逆向き
];
const q = [1, 0, 0];
const hits = searchChunks(q, chunks, { topK: 5, minScore: 0.35 });
ok('近い順に並ぶ（先頭はA）', hits[0].chunk.id === 'a');
ok('2番目はB', hits[1].chunk.id === 'b');
ok('閾値未満(直交C・逆向きD)は除外', hits.every((h) => h.chunk.id !== 'c' && h.chunk.id !== 'd'));
ok('topK制限が効く', searchChunks(q, chunks, { topK: 1, minScore: 0 }).length === 1);

// ── スコープ外 ──
const none = searchChunks([0, 0, 1], chunks, { minScore: 0.35 }); // どれとも近くない方向
ok('全部閾値未満ならスコープ外(空)', isOutOfScope(none));
ok('ヒットあればスコープ内', !isOutOfScope(hits));

// ── hitsToCards（url重複の畳み込み・最大件数） ──
const dupHits = [
  { chunk: mk('a1', '/a', 'A記事', [1, 0]), score: 0.9 },
  { chunk: mk('a2', '/a', 'A記事(別見出し)', [1, 0]), score: 0.8 }, // 同一url
  { chunk: mk('b1', '/b', 'B記事', [1, 0]), score: 0.7 },
  { chunk: mk('e1', '/e', 'E記事', [1, 0]), score: 0.6 },
];
const cards = hitsToCards(dupHits, 3);
ok('同一urlは1枚に畳む', cards.filter((c) => c.href === '/a').length === 1);
ok('最大3枚', cards.length === 3);
ok('カードはhref/title/categoryを持つ', !!cards[0].href && !!cards[0].title && !!cards[0].category);

console.log(`\n===== ragSearch テスト =====`);
if (fails.length) console.log(fails.join('\n'));
console.log(`\n合格 ${pass} / 失敗 ${fail}`);
if (fail > 0) process.exit(1);
console.log('✓ 全ケース通過');
