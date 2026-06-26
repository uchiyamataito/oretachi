// 詳細ページの回遊レコメンド。記事・Q&Aを横断し、(1)関連=同じ悩み (2)この先=次フェーズ を返す。
// 既存メタ（meta.ts）＋フロントマターの related_articles / related_qa を活用。
import { AMETA, QMETA } from './meta';

const PHASE_ORDER = ['切り出された直後', '別居', '協議・調停中', '成立後', '再出発'];

export type PoolItem = {
  slug: string; type: 'article' | 'qa'; url: string; title: string;
  phases: string[]; kanshin: string[]; route?: string; kids?: boolean;
  related: string[];
};

// 全記事・Q&Aを1つのプールに（getStaticPaths から渡す collection を使う）
export function buildPool(articles: any[], qas: any[]): PoolItem[] {
  const a = articles.map((e) => {
    const m = AMETA[e.slug] || {};
    return {
      slug: e.slug, type: 'article' as const, url: `/${e.slug}`, title: e.data.title,
      phases: m.phases || [], kanshin: m.kanshin || [], route: m.route, kids: !!m.kids,
      related: [...(e.data.related_articles || []), ...(e.data.related_qa || [])],
    };
  });
  const q = qas.map((e) => {
    const m = QMETA[e.slug] || {};
    return {
      slug: e.slug, type: 'qa' as const, url: `/qa/${e.slug}`, title: e.data.question,
      phases: m.phases || [], kanshin: m.kanshin || [], route: m.route, kids: false,
      related: [...(e.data.related_articles || []), ...(e.data.related_qa || [])],
    };
  });
  return [...a, ...q];
}

// 関連度：テーマ一致×2 ＋ 段階一致×1 ＋ ルート一致×1 ＋ 子ども一致×0.5
function relScore(item: PoolItem, cur: PoolItem): number {
  let s = 0;
  (cur.kanshin || []).forEach((k) => { if ((item.kanshin || []).includes(k)) s += 2; });
  (cur.phases || []).forEach((p) => { if ((item.phases || []).includes(p)) s += 1; });
  if (cur.route && item.route && cur.route === item.route) s += 1;
  if (cur.kids && item.kids) s += 0.5;
  return s;
}

export function recommend(pool: PoolItem[], cur: PoolItem) {
  const others = pool.filter((x) => !(x.type === cur.type && x.slug === cur.slug));
  const explicit = new Set(cur.related || []);

  // (1) 関連レール：同じテーマ/段階（フロントマターの明示関連は強く優先）
  const related = others
    .map((x) => ({ x, s: relScore(x, cur) + (explicit.has(x.slug) ? 6 : 0) }))
    .filter((o) => o.s > 0)
    .sort((a, b) => b.s - a.s)
    .map((o) => o.x);
  const relatedTop = related.slice(0, 4);
  // 関連が少なすぎる場合は他で補完（空にしない）
  if (relatedTop.length < 3) {
    for (const x of others) {
      if (relatedTop.length >= 3) break;
      if (relatedTop.indexOf(x) === -1) relatedTop.push(x);
    }
  }
  const used = new Set(relatedTop.map((x) => x.slug));

  // (2) この先レール：現在地より後のフェーズ（先回り）。近い未来を優先。
  const curIdx = Math.max(-1, ...(cur.phases || []).map((p) => PHASE_ORDER.indexOf(p)));
  const next = (curIdx >= 0 && curIdx < PHASE_ORDER.length - 1)
    ? others
        .filter((x) => !used.has(x.slug))
        .filter((x) => (x.phases || []).some((p) => PHASE_ORDER.indexOf(p) > curIdx))
        .filter((x) => !(x.phases || []).some((p) => (cur.phases || []).includes(p)))
        .map((x) => {
          const future = (x.phases || []).map((p) => PHASE_ORDER.indexOf(p)).filter((i) => i > curIdx);
          const nIdx = future.length ? Math.min(...future) : 99;
          return { x, s: relScore(x, cur) - (nIdx - curIdx) * 0.3 };
        })
        .sort((a, b) => b.s - a.s)
        .map((o) => o.x)
        .slice(0, 3)
    : [];

  return { related: relatedTop, next };
}
