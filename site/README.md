# オレタチ（site）

離婚を切り出された男性向けポータル「オレタチ」のサイト本体（Astro）。
このコードはCowork上のサンドボックスで **ビルド検証済み**（ページ生成・記事ルーティング・構造化データ Article/Breadcrumb/FAQ・sitemap・トップ記事一覧）。

## 記事の置き場所（ノーコード更新）

記事は `src/content/articles/` に **スラッグ.md** で置く。ファイル名がそのままURL（例：`rikon-kenkohoken-tetsuzuki.md` → `https://oretachi.me/rikon-kenkohoken-tetsuzuki`）。

> 初期記事3本は **`src/content/articles/` に配置済み**（スラッグ名・faqフロントマター付き）。以降の編集はこの`site/`内のファイルが正（`ProjectA/articles/`のドラフトは元データ）。
> - `rikon-kiridasareta-saisho-14nichi.md`（#1 初動）
> - `rikon-mada-wakaretakunai.md`（#11 まだ別れたくない人へ）
> - `rikon-kenkohoken-tetsuzuki.md`（#3 健康保険）

## ローカルで動かす（任意）

```bash
npm install
npm run dev      # http://localhost:4321
npm run build    # dist/ に静的サイトを生成
```

## 公開（Cloudflare Pages・ローカル不要）

1. このフォルダ（`site/`）をGitHubリポジトリに上げる（**push＝内山さん作業**）
2. Cloudflare Pages でそのリポジトリを連携。ビルド設定：
   - Framework preset: **Astro**
   - Build command: `npm run build`
   - Output directory: `dist`
3. ドメイン `oretachi.me` をCloudflareでDNS設定（**取得＝内山さん作業／金銭発生**）
4. 公開後すぐ Search Console と GA4 を登録

> push以降、GitHubに上げるたびCloudflareが自動でビルド・公開する。ローカルにNodeを入れなくても、GitHub→Cloudflareのクラウドビルドだけで公開できる。

## 構成

- `src/content/config.ts` … 記事スキーマ
- `src/layouts/BaseLayout.astro` … head・メタ・OGP・canonical・JSON-LD
- `src/layouts/ArticleLayout.astro` … 目次・本文・免責
- `src/pages/[slug].astro` … 記事ページ自動生成
- `src/pages/index.astro` … トップ
- `src/content/qa/` … Q&A（記事と同列の独立コンテンツ。`スラッグ.md`）
- `src/pages/qa/index.astro` … Q&A一覧（カード＋キーワード検索＋お悩み分類フィルタ）
- `src/pages/qa/[slug].astro` … Q&A詳細
- `src/layouts/QaLayout.astro` … Q&A詳細レイアウト（Q→回答→「役に立った」→関連）
- `src/styles/global.css` … モバイル可読性優先
- `astro.config.mjs` … site URL・sitemap

詳細仕様は `../11_build_plan.md`。
