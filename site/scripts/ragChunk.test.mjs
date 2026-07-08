// ragChunk.mjs のユニットテスト（node scripts/ragChunk.test.mjs）
// レビュー(2026-07-08)反映：フッター除去・FAQ二重排除・表/チェック/番号除去・ID安定性・rag除外・メタ付与を検証。
import { parseFrontmatter, chunkArticle, chunkQa } from './ragChunk.mjs';

let pass = 0, fail = 0; const fails = [];
const ok = (c, l, e = '') => { if (c) pass++; else { fail++; fails.push(`✗ ${l} ${e}`); } };

const article = `---
title: "別居のお金：生活費と棚卸し"
description: "別居のお金の話。"
category: "別居・生活"
published: "2026-06-26"
updated: "2026-07-02"
faq:
  - q: "別居中の婚姻費用は、いつから請求できる？"
    a: "原則として請求した時点から請求できます。"
  - q: "勝手に家を出たら不利？"
    a: "正当な理由なく出ると不利になることがあります。"
---

別居は、ただの引っ越しじゃない。**順番**が大事だ。

## お金の棚卸し

まず全部書き出す。

| 区分 | 主な項目 |
|---|---|
| 資産 | 預金・保険 |
| 負債 | ローン |

チェックリスト:
- [ ] 預金を確認する
- [x] 保険証券を確認する

手順:
1. 全部出す
2. 分けて考える

## よくある質問

**Q. 別居中の生活費は？**
A. 婚姻費用として請求できる。

### この記事について

出典:
- 厚生労働省 https://www.mhlw.go.jp/example
- 連絡先 03-1234-5678

最終更新:2026-07-02
`;

const fa = parseFrontmatter(article);
const ac = chunkArticle({ data: fa.data, body: fa.body, slug: 'rikon-bekkyo' });
const allText = ac.map((c) => c.text).join('\n');

ok(fa.data.faq.length === 2, 'faq 2件');
ok(ac.some((c) => c.heading === 'お金の棚卸し'), 'H2チャンクあり');
ok(!ac.some((c) => /よくある質問/.test(c.heading)), '本文FAQ(H2)はスキップ');
ok(ac.some((c) => c.id.includes('#faq-') && c.text.startsWith('Q:')), 'frontmatter FAQチャンクあり');
ok(!allText.includes('この記事について') && !allText.includes('mhlw.go.jp') && !allText.includes('最終更新'), 'フッター除去', allText.slice(-40));
ok(!allText.includes('|') && !allText.includes('---'), '表・水平線除去');
ok(!allText.includes('[ ]') && !allText.includes('[x]'), 'チェックボックス除去');
ok(!/(^|\n)\d+\.\s/.test(allText), '番号リスト除去');
ok(ac.every((c) => c.id && c.hash && c.category === '別居・生活' && c.updated === '2026-07-02'), 'メタ(id/hash/category/updated)付与', JSON.stringify(ac[0]));

// ID安定性：前にセクションを1つ挿入しても、既存見出しのIDは不変
const inserted = article.replace('## お金の棚卸し', '## 追加された前置き\n\nここは新しく追加された前置きの節で、別居の心構えについて十分な長さで書いてある。\n\n## お金の棚卸し');
const ins = parseFrontmatter(inserted);
const ac2 = chunkArticle({ data: ins.data, body: ins.body, slug: 'rikon-bekkyo' });
ok(ac.find((c) => c.heading === 'お金の棚卸し').id === ac2.find((c) => c.heading === 'お金の棚卸し').id, 'セクション挿入でも既存IDが不変');
ok(ac2.some((c) => c.heading === '追加された前置き'), '挿入した節もチャンク化');

// rag: false は parseFrontmatter で拾える（build-rag側で除外する）
ok(parseFrontmatter(article.replace('category: "別居・生活"', 'category: "別居・生活"\nrag: false')).data.rag === 'false', 'rag:false を検出');

// Q&A
const qa = `---
question: "気まずいから家を出た方がいい？"
description: "勢いで出るな。"
category: "生活"
published: "2026-06-25"
updated: "2026-06-28"
---

**結論：勢いで家を出るな。** あとで生活費・財産に影響する。
`;
const fq = parseFrontmatter(qa);
const qc = chunkQa({ data: fq.data, body: fq.body, slug: 'rikon-ie-deru-beki' });
ok(qc.length === 1 && qc[0].sourceType === 'qa' && qc[0].url === '/qa/rikon-ie-deru-beki', 'qa基本');
ok(qc[0].title.includes('家を出た方がいい') && qc[0].hash && qc[0].updated === '2026-06-28', 'qaメタ');
ok(!qc[0].text.includes('**'), 'qa markdown除去');

console.log('\n===== ragChunk 改良版 ユニットテスト =====');
if (fails.length) console.log(fails.join('\n'));
console.log(`\n合格 ${pass} / 失敗 ${fail}`);
if (fail > 0) process.exit(1);
console.log('✓ 全ケース通過');
