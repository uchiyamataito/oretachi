import { defineCollection, z } from 'astro:content';

// 記事（深く理解させるコンテンツ）
const articles = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    description: z.string(),
    target_keyword: z.string().optional(),
    secondary_keywords: z.array(z.string()).optional(),
    category: z.string(),
    module: z.array(z.string()).optional(),
    tags: z.array(z.string()).optional(),
    author: z.string().default('オレタチ編集部'),
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
  }),
});

// Q&A（記事と同列の独立コンテンツ。カード一覧・検索・分類で探す）
const qa = defineCollection({
  type: 'content',
  schema: z.object({
    question: z.string(),       // 質問（タイトル）
    description: z.string(),    // 抜粋（カード・meta）
    category: z.string(),       // お悩み分類（5モジュール）
    tags: z.array(z.string()).optional(),
    related_articles: z.array(z.string()).optional(),
    related_qa: z.array(z.string()).optional(),
    author: z.string().default('オレタチ編集部'),
    supervised_by: z.string().optional(),
    published: z.string(),
    updated: z.string(),
    canonical: z.string().optional(),
    disclaimer: z.string().optional(),
  }),
});

export const collections = { articles, qa };
