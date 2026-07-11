// オレタチ RAG 知識ベース チャンク化（Phase A・¥0／doc42§5・doc43§9準拠）
// 記事・Q&Aを「見出し単位の小さな塊（chunk）」に分割し、AIが検索できる形にする純ロジック。
// 埋め込み(embedding)や検索はPhase Cで足す。ここはテキストの下ごしらえだけ＝API不要・コスト¥0。
// レビュー(2026-07-08)反映：フッター除去・FAQ二重排除・表/チェック/番号/HTML除去・出典ハッシュ・メタ追加。
//
// レコードの形（汎用・将来 sourceType に 'chat_stats' / 'ugc' を足せる）：
// { id, hash, sourceType, ref, url, title, category, heading, text, published, updated }
//   hash = text の内容フィンガープリント。Phase Cで「hashが変わった塊だけ再埋め込み」に使う。
//
// テスト実行： node scripts/ragChunk.test.mjs

/** 内容フィンガープリント（djb2→base36）。同じ文字列は同じ値＝埋め込みキャッシュのキーに使える。 */
export function shortHash(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/** frontmatter（---で囲まれた先頭）から必要な項目を取り出す。依存ライブラリなしの最小実装。 */
export function parseFrontmatter(md) {
  md = md.replace(/^﻿/, '').replace(/\r\n/g, '\n'); // BOM・CRLF正規化
  const m = md.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) { console.warn('[rag] frontmatterを検出できませんでした（先頭が --- でない可能性）'); return { data: {}, body: md }; }
  const fm = m[1];
  const body = m[2];
  const get = (key) => {
    const q = fm.match(new RegExp('^' + key + ':\\s*"([\\s\\S]*?)"\\s*$', 'm'));
    if (q) return q[1].trim();
    const u = fm.match(new RegExp('^' + key + ':\\s*(.+)$', 'm'));
    return u ? u[1].trim().replace(/^"|"$/g, '') : '';
  };
  const data = {
    title: get('title'),
    description: get('description'),
    category: get('category'),
    question: get('question'),
    published: get('published'),
    updated: get('updated'),
    rag: get('rag'), // 'false' なら build-rag 側で除外
    image: (fm.match(/hero_image:\s*\n\s*src:\s*"([^"]*)"/) || [])[1] || '', // ヒーロー画像（カード表示用）
  };
  const faq = [];
  const block = fm.match(/faq:\n([\s\S]*?)(?=\n[a-zA-Z_]+:|$)/);
  if (block) {
    let cur = null;
    for (const line of block[1].split('\n')) {
      const q = line.match(/^\s*-\s*q:\s*"([\s\S]*?)"\s*$/);
      const a = line.match(/^\s*a:\s*"([\s\S]*?)"\s*$/);
      if (q) { if (cur) faq.push(cur); cur = { q: q[1], a: '' }; }
      else if (a && cur) { cur.a = a[1]; }
    }
    if (cur) faq.push(cur);
  }
  data.faq = faq;
  return { data, body };
}

/** markdown を検索用プレーンテキストへ。画像/リンク/表/チェック/番号/箇条書き/水平線/引用/見出し/強調/HTMLを除去。 */
export function cleanText(md) {
  return md
    .replace(/<[^>]+>/g, ' ')                          // HTMLタグ
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')              // 画像
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')           // リンク → テキストだけ
    .replace(/^\s*\|?[\s:|-]{3,}\|?\s*$/gm, '')        // 表の区切り行 |---|
    .replace(/^[ \t]*\|(.+)\|[ \t]*$/gm, (_, c) => c.split('|').map((s) => s.trim()).filter(Boolean).join(' / ')) // 表の行 → セルを / 区切りに
    .replace(/^\s*[-*+]?\s*\[[ xX]\]\s*/gm, '・')      // チェックボックス [ ] / [x]
    .replace(/^\s*\d+\.\s+/gm, '・')                   // 番号リスト 1.
    .replace(/^\s*[-–—*+]\s+/gm, '・')                 // 箇条書き
    .replace(/^\s*[-=*]{3,}\s*$/gm, '')                // 水平線 --- / ***
    .replace(/^>\s?/gm, '')                            // 引用
    .replace(/^#{1,6}\s+/gm, '')                       // 見出し記号
    .replace(/[*_`]+/g, '')                            // 強調
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

// 記事末尾の「この記事について／出典／参考文献／運営者情報」等のフッター見出し以降を切り離す
const FOOTER_RE = /\n#{2,6}\s*(?:この記事について|出典|参考文献|運営者情報|関連記事|免責)/;
// 本文中の「よくある質問／FAQ」H2は frontmatter faq と重複するのでスキップ
const DUP_FAQ_RE = /^(よくある質問|Q ?& ?A|FAQ)/i;

/** 記事を H2 見出し単位でチャンク化＋frontmatterのFAQをチャンク化。フッター・重複FAQは除外。 */
export function chunkArticle({ data, body, slug }) {
  const chunks = [];
  const url = '/' + slug;
  const main = body.split(FOOTER_RE)[0]; // フッター以降を捨てる
  const parts = main.split(/\n(?=##\s+)/);
  parts.forEach((part) => {
    const hm = part.match(/^##\s+(.+)/);
    const heading = hm ? hm[1].trim() : (data.title || '');
    if (DUP_FAQ_RE.test(heading)) return; // 本文FAQは frontmatter faq に一本化
    const raw = hm ? part.replace(/^##\s+.+\n?/, '') : part;
    const text = cleanText(raw);
    if (text.length < 20) return;
    chunks.push(makeRecord('article', slug, url, data, heading, text, shortHash(heading)));
  });
  (data.faq || []).forEach((f) => {
    if (!f.q || !f.a) return;
    const text = cleanText(`Q: ${f.q}\nA: ${f.a}`);
    chunks.push(makeRecord('article', slug, url, data, f.q, text, 'faq-' + shortHash(f.q)));
  });
  return chunks;
}

/** Q&A を1チャンクに（回答は短いので分割しない）。 */
export function chunkQa({ data, body, slug }) {
  const text = cleanText(body);
  if (text.length < 10) return [];
  return [makeRecord('qa', slug, '/qa/' + slug, { ...data, title: data.question, category: data.category }, data.question, text, 'a')];
}

function makeRecord(sourceType, slug, url, data, heading, text, idSuffix) {
  return {
    id: `${sourceType}:${slug}#${idSuffix}`, // 並び順に依存しない安定ID（見出し由来）
    hash: shortHash(text),                    // 内容フィンガープリント（Phase C 埋め込みキャッシュ用）
    sourceType,
    ref: slug,
    url,
    title: data.title || '',
    category: data.category || '',
    heading,
    text,
    image: data.image || '',
    published: data.published || '',
    updated: data.updated || '',
  };
}
