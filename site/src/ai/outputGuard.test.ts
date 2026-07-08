// outputGuard.ts のユニットテスト（node --experimental-strip-types src/ai/outputGuard.test.ts）
import { guardOutput, OUTPUT_FALLBACK } from './outputGuard.ts';

let pass = 0, fail = 0;
const fails: string[] = [];
function expect(label: string, text: string, hasSource: boolean, wantOk: boolean, wantReason?: string) {
  const r = guardOutput(text, hasSource, OUTPUT_FALLBACK);
  const okMatch = r.ok === wantOk;
  const reasonMatch = wantReason ? r.reasons.includes(wantReason) : true;
  if (okMatch && reasonMatch) pass++;
  else { fail++; fails.push(`✗ ${label}\n   ok=${r.ok}(期待${wantOk}) reasons=${JSON.stringify(r.reasons)}`); }
}

// 正常：出典あり・断定なし → そのまま出す
expect('通常回答は通す', '別居中の生活費は、収入や子どもの有無で変わります。まずは家計の棚卸しから始めましょう。', true, true);

// 出典なし → 差し止め（作話防止）
expect('出典なしは差し止め', '一般的にはこう言われています。', false, false, 'no_source');
expect('空文字は差し止め', '', true, false, 'no_source');

// 封印テーマ×具体額 → 差し止め
expect('慰謝料+金額は差し止め', '慰謝料は300万円もらえます。', true, false, 'sealed_amount');
expect('養育費+金額(逆順)は差し止め', '毎月8万円が養育費の相場です。', true, false, 'sealed_amount');

// 封印テーマ×金額が別々の文に分かれても検知（M-2＝文またぎ）
expect('封印×金額の文またぎは差し止め', '慰謝料について整理しよう。相場はおおむね300万円だ。', true, false, 'sealed_amount');
// 生活費の金額は誤爆させない（封印語がない）
expect('生活費の月額は通す', '生活費は月に5万円ほどかかることもあります。参考記事を見てください。', true, true);
// 別段落の金額は誤爆させない（封印語と金額が空行で隔たっている）
expect('別段落の金額は通す', '養育費の記事はこちら。\n\n生活費は月5万円ほど。', true, true);

// 個別の法的判断の断定 → 差し止め
expect('法的断定は差し止め', 'あなたのケースなら親権は取れます。', true, false, 'legal_judgement');
expect('勝敗断定は差し止め', '今回は勝てます。', true, false, 'legal_judgement');

// 過度な確約 → 差し止め
expect('必ず取れるは差し止め', '必ず親権を取れます。', true, false, 'over_assertion');
expect('絶対に復縁できるは差し止め', '絶対に復縁できます。', true, false, 'over_assertion');
// 商品・サービスの推奨は差し止め（M-1）。一般的な相談先の案内は通す。
expect('特定サービス推奨は差し止め', '離婚問題は◯◯法律事務所を使えば安心です。', true, false, 'product_promo');
expect('登録勧誘は差し止め', 'まずは△△サービスに登録しましょう。', true, false, 'product_promo');
expect('専門家に相談のおすすめは通す', '不安なら専門家に相談するのがおすすめです。', true, true);
expect('公的窓口の案内は通す', '手続きは役所の窓口に申し込むといい。参考記事も見てくれ。', true, true);

// 差し止め時は fallback 文言に差し替わる
{
  const r = guardOutput('慰謝料は500万円もらえます。', true, OUTPUT_FALLBACK);
  if (!r.ok && r.text === OUTPUT_FALLBACK) pass++;
  else { fail++; fails.push(`✗ fallback差し替え\n   text=${r.text}`); }
}

console.log(`\n===== outputGuard テスト =====`);
if (fails.length) console.log(fails.join('\n'));
console.log(`\n合格 ${pass} / 失敗 ${fail}`);
if (fail > 0) process.exit(1);
console.log('✓ 全ケース通過');
