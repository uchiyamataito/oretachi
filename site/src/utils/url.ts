// URLの末尾スラッシュを正規化するユーティリティ。
// このサイトはディレクトリ形式（/page/）で配信されるため、canonical・パンくず・og:url を
// 実際の配信URL（末尾スラッシュ付き）に揃え、「canonicalがリダイレクト先を指す」不一致を防ぐ。
// クエリ（?）・ハッシュ（#）付きや空文字はそのまま返す（壊さない）。
export function withTrailingSlash(url: string): string {
  if (!url) return url;
  if (/[?#]/.test(url)) return url;
  return url.endsWith('/') ? url : url + '/';
}
