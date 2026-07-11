// オレタチ 出力ガード（Phase C・後段フィルタ／doc42§6・doc16§3-B）
// Claude の生成文を「出す前」に検査し、以下を差し止める＝入力ガード(guards.ts)の"出口"側の二重化。
//   ① 出典（RAGヒット）が無い生成は出さない（作話禁止）
//   ② 封印テーマの金額算定が漏れた場合（財産分与/慰謝料/養育費/年金＋具体額）
//   ③ 個別の法的判断の断定（「あなたは勝てます」等・弁護士法72条）
//   ④ 過度な確約（必ず/絶対/100% ＋ 成功・獲得語）
//   ⑤ 特定商品・サービスの推奨（景表法・2023ステマ規制の後段バックストップ・M-1）
// 差し止め時は安全な定型へ差し替える。API を呼ばない純ロジック＝¥0 でテスト可能。
//
// テスト実行： node --experimental-strip-types src/ai/outputGuard.test.ts

export interface OutputGuardResult {
  ok: boolean; // true=そのまま出してよい / false=fallback へ差し替え
  text: string; // 実際に表示する本文
  reasons: string[]; // 差し止め理由（ログ用・内容は残さず種別のみ）
}

// ② 封印テーマ×具体的な金額。**同じ段落内に封印語と金額が共起**したら封印金額の漏れとみなす。
// 段落（空行 \n\n 区切り）単位で判定＝距離に依存せず拾う（長文でも見逃さない）／別段落の無関係な金額は誤爆させない。
const SEALED_TOPIC_RE = /(財産分与|慰謝料|養育費|年金分割)/;
const AMOUNT_RE = /\d{1,5}\s*[万億]?円/;
function hasSealedAmount(t: string): boolean {
  return t.split(/\n{2,}/).some((p) => SEALED_TOPIC_RE.test(p) && AMOUNT_RE.test(p));
}
// ③ 個別の法的判断の断定
const LEGAL_JUDGE = /(あなた|今回|この(ケース|場合)|お客様)[^。\n]{0,16}?(勝て(ます|る)|負け(ます|る)|違法です|合法です|認められます|通ります|取れます)/;
// ④ 過度な確約（成功・獲得を確約する断定）
const OVER_ASSERT = /(必ず|絶対に?|確実に|100\s*%|間違いなく)[^。\n]{0,14}?(勝て|取れ|もらえ|認められ|成功|解決|回復|復縁でき)/;
// ⑤ 特定商品・サービスの推奨（M-1）。推奨表現を検知しつつ、一般的な案内（専門家・公的窓口・弁護士に相談等）は除外する。
const PRODUCT_PROMO = /(おすすめ(?:です|だ|の)|をおすすめ|を使え(?:ば|ます)|を利用(?:すれ|しま|しよう)|に登録(?:すれ|しま|しよう)|を契約(?:すれ|しま|しよう)|がベスト|が一番いい|が最適|に申し込)/;
// 推奨先が"一般的な相談先"なら商品推奨ではない（差し止めない）
const GENERIC_TARGET = /(専門家|弁護士|司法書士|行政書士|公的|窓口|役所|自治体|法テラス|市区町村|ホットライン|相談窓口|カウンセラー|医療機関)/;

/**
 * 生成文を検査。問題があれば fallback（定型：記事/窓口案内）へ差し替える。
 * @param text 生成された回答
 * @param hasSource RAG のヒット（出典）が付いているか
 * @param fallback 差し止め時に出す安全な定型文
 */
// 二層設計（doc43§14）：共感・心構えの応答は出典が無くても正当なので、"出典なし"は差し止めない。
// 差し止めるのは「危険な事実主張」＝封印金額・個別法判断・過度な確約・商品推奨、および空応答のみ。
// hasSource は Worker が出典表示の要否を判断するために受け取る（差し止め判定には使わない）。
export function guardOutput(text: string, hasSource: boolean, fallback: string): OutputGuardResult {
  const t = (text || '').normalize('NFKC');
  const reasons: string[] = [];

  if (t.trim().length === 0) reasons.push('empty');
  if (hasSealedAmount(t)) reasons.push('sealed_amount');
  if (LEGAL_JUDGE.test(t)) reasons.push('legal_judgement');
  if (OVER_ASSERT.test(t)) reasons.push('over_assertion');
  // ⑤ 商品推奨：推奨表現があり、かつ一般的な相談先の案内でない場合のみ差し止め
  if (PRODUCT_PROMO.test(t) && !GENERIC_TARGET.test(t)) reasons.push('product_promo');

  if (reasons.length) return { ok: false, text: fallback, reasons };
  return { ok: true, text, reasons: [] };
}

/** 差し止め時の既定フォールバック（Worker から文言を差し替え可能）。 */
export const OUTPUT_FALLBACK =
  'その点は、このチャットでは断定を控えますね。関係する記事に考え方をまとめていますので、そちらと、必要に応じて公的な窓口・専門家にご相談ください。';
