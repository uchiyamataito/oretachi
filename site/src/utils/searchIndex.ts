// 一覧ページのキーワード検索インデックス（t=タイトル / s=タグ+説明 / b=本文）。
//
// 以前は一覧ページの HTML に <script type="application/json" id="sidx"> で
// 直接埋めていたが、/articles/ が 358KB（うち JSON 333KB）まで肥大していた。
// 回遊のハブが最重量ページになるのはモバイル表示・クロールの両面で不利なので、
// 静的JSONへ切り出し、キーワード検索を使うときだけ取りに行く（browse.js）。

export type SearchRecord = { slug: string; t: string; s: string; b: string };

// Markdown記号を軽く除去し小文字化（関連度づけ用）。
export const strip = (s = ''): string =>
  s.replace(/```[\s\S]*?```/g, ' ')
   .replace(/<!--[\s\S]*?-->/g, ' ')
   .replace(/https?:\/\/\S+/g, ' ')
   .replace(/[#>*`_\[\]()|~]/g, ' ')
   .replace(/\s+/g, ' ')
   .trim().toLowerCase().slice(0, 4000);

// 記事コレクション → 検索インデックス
export function buildArticleIndex(entries: any[]): SearchRecord[] {
  return entries.map((a) => ({
    slug: a.slug,
    t: (a.data.title || '').toLowerCase(),
    s: `${(a.data.tags || []).join(' ')} ${a.data.description || ''}`.toLowerCase(),
    b: strip(a.body || ''),
  }));
}

// Q&Aコレクション → 検索インデックス
export function buildQaIndex(entries: any[]): SearchRecord[] {
  return entries.map((q) => ({
    slug: q.slug,
    t: (q.data.question || '').toLowerCase(),
    s: `${(q.data.tags || []).join(' ')} ${q.data.description || ''}`.toLowerCase(),
    b: strip(q.body || ''),
  }));
}

export function jsonResponse(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=3600',
    },
  });
}
