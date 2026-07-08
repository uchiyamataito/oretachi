// ragChunk.mjs のユニットテスト（node scripts/ragChunk.test.mjs）
import { parseFrontmatter, chunkArticle, chunkQa } from './ragChunk.mjs';

let pass = 0, fail = 0; const fails = [];
const ok = (c, l, e = '') => { if (c) pass++; else { fail++; fails.push(`✗ ${l} ${e}`); } };

const article = `---
title: "別居したら離婚になる？期間・生活費と、やってはいけないこと"
description: "妻と別居が始まりそうな男性へ。"
category: "別居・生活"
published: "2026-06-26"
faq:
  - q: "別居期間は、裁判でどう評価される？"
    a: "法律で決まった年数はありません。目安として3〜5年程度とされます。"
  - q: "別居中の婚姻費用は、いつから請求できる？"
    a: "原則として請求した時点から請求できます。"
cta: "オレタチの初動ナビ"
---

別居、という言葉が急に現実になった。**別居は、ただの引っ越しじゃない。**

![別居で先に押さえる3つ](/img/articles/soudan/12/fig.svg)

> ※この記事は別居の「準備と判断」の話だ。

## まず結論：別居でいちばん大事なこと

時間も気力もないなら、これだけでいい。詳しくは[全体マップ](/rikon-nani-kara-hajimeru)を見てくれ。

## 別居中の生活費（婚姻費用）

収入の多い側が少ない側に払うのが基本だ。
- 請求した月から動く
- 早めに専門家へ
`;

const qa = `---
question: "離婚を切り出された。気まずいから、とりあえず家を出た方がいいか？"
description: "勢いで出るのは待て。"
category: "生活"
published: "2026-06-25"
canonical: "https://oretachi.me/qa/rikon-ie-deru-beki"
---

**結論：「気まずいから」だけで、勢いで家を出るな。** 別居は、あとで生活費・財産・子どものことに影響することがある。

> ★ **ここだけは**：身の危険があるなら、安全の確保が何より優先だ。

何を・どの順でやるかは[全体マップ](/rikon-nani-kara-hajimeru)にまとめてある。
`;

const fa = parseFrontmatter(article);
ok(fa.data.title.includes('別居したら離婚'), 'article title', fa.data.title);
ok(fa.data.faq.length === 2, 'faq 2件', JSON.stringify(fa.data.faq));
const ac = chunkArticle({ data: fa.data, body: fa.body, slug: 'rikon-bekkyo' });
ok(ac.length >= 4, 'articleチャンク4件以上', String(ac.length));
ok(ac.some(c => c.heading === 'まず結論：別居でいちばん大事なこと'), 'H2見出しチャンク');
ok(ac.some(c => c.id.includes('#faq') && c.text.startsWith('Q:')), 'FAQチャンク');
ok(ac.every(c => c.url === '/rikon-bekkyo'), 'article url');
const joined = ac.map(c => c.text).join('\n');
ok(!joined.includes('![') && !joined.includes('](') && !joined.includes('##') && !joined.includes('**') && !joined.includes('>'), 'markdown除去', joined.slice(0, 40));

const fq = parseFrontmatter(qa);
const qc = chunkQa({ data: fq.data, body: fq.body, slug: 'rikon-ie-deru-beki' });
ok(qc.length === 1, 'qaチャンク1件');
ok(qc[0].sourceType === 'qa' && qc[0].url === '/qa/rikon-ie-deru-beki', 'qa url/type');
ok(qc[0].title.includes('家を出た方がいい'), 'qa title=question');
ok(!qc[0].text.includes('**') && !qc[0].text.includes('](') && !qc[0].text.includes('>'), 'qa markdown除去', qc[0].text.slice(0, 40));

console.log('\n===== ragChunk ユニットテスト =====');
if (fails.length) console.log(fails.join('\n'));
console.log(`\n合格 ${pass} / 失敗 ${fail}`);
if (fail > 0) process.exit(1);
console.log('✓ 全ケース通過');
