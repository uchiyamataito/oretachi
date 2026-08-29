import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

// 記事（深く理解させるコンテンツ）
// 走査範囲は「直下の .md のみ・_ 始まりは除外」に固定する。理由は3つ。
//  1. Astro5で type:'content' のアンダースコア除外が廃止され、pattern が唯一の門番になった。
//     '**/[^_]*.md' では _ の判定がファイル名の先頭1文字にしか効かず、_wip/draft.md が素通りする。
//  2. サブフォルダに置くと entry.id に / が入り、[slug].astro が Missing parameter: slug で
//     ビルドごと落ちる。拾ってから落ちるより、最初から拾わない方が事故が分かりやすい。
//  3. scripts/build-rag.mjs の readdirSync が非再帰なので、Astro側だけが深く拾うと
//     「サイトには出るのにRAGには無い／その逆」というズレが生まれる。範囲を揃える。
// サブフォルダに .md を置いても無視されるだけなので、置き忘れは npm run check が警告する。
const articles = defineCollection({
  loader: glob({ base: './src/content/articles', pattern: ['*.md', '!_*'] }),
  schema: z.object({
    title: z.string(),
    seo_title: z.string().optional(),
    description: z.string(),
    target_keyword: z.string().optional(),
    secondary_keywords: z.array(z.string()).optional(),
    category: z.string(),
    module: z.array(z.string()).optional(),
    tags: z.array(z.string()).optional(),
    author: z.string().default('片瀬 海斗'),
    author_profile: z.string().optional(),
    operator_info: z.string().optional(),
    supervised_by: z.string().optional(),
    published: z.string(),
    updated: z.string(),
    canonical: z.string().optional(),
    schema: z.array(z.string()).optional(),
    breadcrumb: z.array(z.string()).optional(),
    hero_image: z.object({ src: z.string(), alt: z.string(), caption: z.string().optional() }).optional(),
    faq: z.array(z.object({ q: z.string(), a: z.string() })).optional(),
    cta: z.string().optional(),
    disclaimer: z.string().optional(),
    rag: z.boolean().optional(), // false でこの記事をRAG（AIチャットの根拠）対象外にする
  }),
});

// Q&A（記事と同列の独立コンテンツ。カード一覧・検索・分類で探す）
const qa = defineCollection({
  loader: glob({ base: './src/content/qa', pattern: ['*.md', '!_*'] }),
  schema: z.object({
    question: z.string(),       // 質問（タイトル）。H1・パンくず・FAQ構造化データに使う会話体
    // <title>専用の短縮版。question が長く日本語SERPで切れる場合だけ指定する。
    // 「｜オレタチ」suffixを足して全角32文字以内に収め、需要語を前方に置く（35_seo_review.md）。
    seo_title: z.string().optional(),
    description: z.string(),    // 抜粋（カード・meta）
    category: z.string(),       // お悩み分類（5モジュール）
    tags: z.array(z.string()).optional(),
    related_articles: z.array(z.string()).optional(),
    related_qa: z.array(z.string()).optional(),
    author: z.string().default('片瀬 海斗'),
    supervised_by: z.string().optional(),
    published: z.string(),
    updated: z.string(),
    canonical: z.string().optional(),
    disclaimer: z.string().optional(),
    rag: z.boolean().optional(), // false でこのQ&AをRAG対象外にする
  }),
});

export const collections = { articles, qa };
