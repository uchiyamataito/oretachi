// 記事一覧のキーワード検索インデックス（静的JSON）。/articles/ から遅延取得する。
import { getCollection } from 'astro:content';
import { buildArticleIndex, jsonResponse } from '../../utils/searchIndex';

export async function GET() {
  const all = (await getCollection('articles')).sort((a, b) =>
    a.data.published < b.data.published ? 1 : -1
  );
  return jsonResponse(buildArticleIndex(all));
}
