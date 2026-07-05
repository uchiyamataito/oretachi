import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
// CommonMark標準では、太字「**」が日本語の約物（。「」（）等）に隣接すると
// 太字として認識されず記号がそのまま表示される。これを解消するCJK対応プラグイン。
// 非CJK言語のHTML出力には影響しない（CommonMarkテスト互換）。
import remarkCjkFriendly from 'remark-cjk-friendly';

// 本番ドメイン。sitemap/canonical の基準になる。
export default defineConfig({
  site: 'https://oretachi.me',
  integrations: [
    // styleguide（内部確認用・noindex）はサイトマップに載せない
    sitemap({ filter: (page) => !page.includes('/styleguide') }),
  ],
  markdown: {
    // コードブロック（プロンプト例など）はダークなシンタックスハイライトを使わず、
    // CSSで引用的な淡いデザインにする（プレーン出力）。
    syntaxHighlight: false,
    // 太字「**」のCJK隣接問題を全記事一括で解消。
    remarkPlugins: [remarkCjkFriendly],
  },
});
