// オレタチ RAG 知識ベース チャンク化（Phase A・¥0／doc42§5・doc43§9準拠）
// 記事・Q&Aを「見出し単位の小さな塊（chunk）」に分割し、AIが検索できる形にする純ロジック。
// 埋め込み(embedding)や検索はPhase Cで足す。ここはテキストの下ごしらえだけ＝API不要・コスト¥0。
//
// レコードの形（汎用・将来 sourceType に 'chat_stats' / 'ugc' を足せる）：
// { id, sourceType, ref, url, title, heading, text, published }
//
// テスト実行： node scripts/ragChunk.test.mjs

/** frontmatter（---で囲まれた先頭）から必要な項目を取り出す。依存ライブラリなしの最小実装。 */
export function parseFrontmatter(md) {
  const m = md.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { data: {}, body: md };
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
  };
  // FAQ（frontmatter内の q/a ペア。単一行クオートを想定・壊れていればスキップ）
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

/** markdown を検索に使うプレーンテキストへ。画像・リンク・引用記号・強調記号を除去。 */
export function cleanText(md) {
  return md
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')      // 画像
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')   // リンク → テキストだけ
    .replace(/^>\s?/gm, '')                    // 引用記号
    .replace(/^#{1,6}\s+/gm, '')               // 見出し記号
    .replace(/[*_`]+/g, '')                    // 強調記号
    .replace(/^\s*[-–—]\s+/gm, '・')           // 箇条書き
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

/** 記事を H2 見出し単位でチャンク化＋FAQをチャンク化。 */
export function chunkArticle({ data, body, slug }) {
  const chunks = [];
  const url = '/' + slug;
  const parts = body.split(/\n(?=##\s+)/); // H2 の直前で分割
  parts.forEach((part, i) => {
    const hm = part.match(/^##\s+(.+)/);
    const heading = hm ? hm[1].trim() : (data.title || '');
    const raw = hm ? part.replace(/^##\s+.+\n?/, '') : part;
    const text = cleanText(raw);
    if (text.length < 20) return; // 短すぎる断片は捨てる
    chunks.push({ id: `article:${slug}#s${i}`, sourceType: 'article', ref: slug, url, title: data.title, heading, text, published: data.published });
  });
  (data.faq || []).forEach((f, i) => {
    if (!f.q || !f.a) return;
    chunks.push({ id: `article:${slug}#faq${i}`, sourceType: 'article', ref: slug, url, title: data.title, heading: f.q, text: `Q: ${f.q}\nA: ${f.a}`, published: data.published });
  });
  return chunks;
}

/** Q&A を1チャンクに（回答は短いので分割しない）。 */
export function chunkQa({ data, body, slug }) {
  const text = cleanText(body);
  if (text.length < 10) return [];
  return [{ id: `qa:${slug}`, sourceType: 'qa', ref: slug, url: '/qa/' + slug, title: data.question, heading: data.question, text, published: data.published }];
}
