// build-rag.mjs — 記事・Q&Aを知識ベース(chunk)へ変換し src/data/rag_chunks.json を書き出す。
// 実行： node scripts/build-rag.mjs  （または npm run build:rag）
// API不要・コスト¥0。埋め込み(embedding)と検索はPhase Cで追加する。
// 将来 sourceType 'chat_stats'（AIチャットの匿名統計）や 'ugc' を足す場合も同じJSONに追記する設計。
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFrontmatter, chunkArticle, chunkQa } from './ragChunk.mjs';

const siteRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const today = new Date().toISOString().slice(0, 10);
const out = [];
let files = 0;

function run(dir, kind) {
  const full = join(siteRoot, 'src', 'content', dir);
  for (const f of readdirSync(full)) {
    if (!f.endsWith('.md')) continue;
    const slug = basename(f, '.md');
    const { data, body } = parseFrontmatter(readFileSync(join(full, f), 'utf8'));
    if (data.published && data.published > today) continue; // 未来日＝未公開は除外
    const chunks = kind === 'article' ? chunkArticle({ data, body, slug }) : chunkQa({ data, body, slug });
    out.push(...chunks);
    files++;
  }
}

run('articles', 'article');
run('qa', 'qa');

const dataDir = join(siteRoot, 'src', 'data');
mkdirSync(dataDir, { recursive: true });
writeFileSync(join(dataDir, 'rag_chunks.json'), JSON.stringify(out, null, 2));

const byType = out.reduce((m, c) => ((m[c.sourceType] = (m[c.sourceType] || 0) + 1), m), {});
console.log(`知識ベース生成: ${files}ファイル → ${out.length}チャンク`, byType);
console.log('出力: src/data/rag_chunks.json');
