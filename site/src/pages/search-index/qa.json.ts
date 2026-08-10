// Q&A一覧のキーワード検索インデックス（静的JSON）。/qa/ から遅延取得する。
import { getCollection } from 'astro:content';
import { buildQaIndex, jsonResponse } from '../../utils/searchIndex';

export async function GET() {
  const items = (await getCollection('qa')).sort((a, b) =>
    a.data.published < b.data.published ? 1 : -1
  );
  return jsonResponse(buildQaIndex(items));
}
