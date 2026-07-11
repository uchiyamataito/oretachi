// オレタチ AIチャット 会話フロー（Phase A・スタブ／doc43準拠）
// 純ロジック＝UIから切り離してテスト可能。API を呼ばない＝コスト¥0。
// 「探す（発見）」＝チップで絞ってカード提案。「調べる（回答）」＝自由入力→回答（今はダミー）。
// 入力ガード（危機/攻撃/封印/PII/インジェクション）は screenInput を通す＝実際に効く。
//
// テスト実行： node --experimental-strip-types src/ai/chatFlow.test.ts

import { screenInput } from './guards.ts';

export interface Chip { label: string; value: string; }
export interface Card { category: string; title: string; href: string; image?: string; }
export type BotKind = 'chips' | 'cards' | 'answer' | 'safe';
export interface BotMessage {
  kind: BotKind;
  text: string;
  chips?: Chip[];
  cards?: Card[];
  moreHref?: string; // 「もっと見る」＝絞り込み適用済み一覧
  moreLabel?: string;
  source?: string; // 出典（調べるモード）
}
export interface FlowState {
  step: 'topic' | 'subtopic' | 'propose';
  topic?: string;
  subtopic?: string;
  turns?: number; // 自由入力(調べる)の往復数。往復上限(M-3)のカウンタ。
  deepen?: number; // 連続した深掘り(選択肢)ターン数。上限(既定3)でサーバが記事を出す。
}

// ── 会話の選択肢とデモ用コンテンツ（実データは後でRAG/コンテンツから差し替え） ──
const TOPICS: Chip[] = [
  { label: 'これからの生活・お金', value: 'money' },
  { label: '気持ちの整理', value: 'feelings' },
  { label: '妻のこと', value: 'wife' },
  { label: '子どものこと', value: 'kids' },
  { label: 'まだ分からない', value: 'unknown' },
];

const SUBTOPICS: Record<string, Chip[]> = {
  money: [
    { label: '毎月の生活費', value: 'living' },
    { label: '今の家をどうするか', value: 'house' },
    { label: '口座・名義', value: 'account' },
  ],
};

// トピック→デモカード（最大3）。href は実記事スラッグ。
const CARDS: Record<string, Card[]> = {
  money: [
    { category: '別居・お金', title: '別居中の生活費・婚姻費用の基本', href: '/rikon-bekkyo' },
    { category: 'お金', title: 'お金の棚卸しチェックリスト', href: '/rikon-okane-checklist' },
    { category: '別居', title: '今の家を出るか迷ったら', href: '/qa/rikon-ie-deru-beki' },
  ],
  feelings: [
    { category: '気持ち・初動', title: '切り出された最初の14日でやること', href: '/rikon-kiridasareta-saisho-14nichi' },
    { category: '気持ち', title: '離婚して後悔する？データと立ち直り方', href: '/rikon-koukai' },
  ],
  wife: [
    { category: '修復', title: '妻と復縁・関係を修復したい', href: '/rikon-fukuen-shuufuku' },
    { category: '返し方', title: '妻に切り出されたら何て返す？', href: '/rikon-kaesu-kotoba' },
  ],
  kids: [
    { category: '子ども', title: '父親の親権｜確率・条件・今できること', href: '/rikon-shinken-chichioya' },
    { category: '子ども', title: '共同親権で父親は何が変わる？', href: '/rikon-kyodo-shinken' },
  ],
  unknown: [
    { category: '初動', title: '何から進める？全体マップ', href: '/rikon-nani-kara-hajimeru' },
  ],
};

const MORE: Record<string, { href: string; label: string }> = {
  money: { href: '/articles?theme=お金', label: '「お金」の記事をもっと見る' },
  feelings: { href: '/articles?theme=気持ち', label: '「気持ち」の記事をもっと見る' },
  wife: { href: '/articles?theme=相談', label: '関連する記事をもっと見る' },
  kids: { href: '/articles?theme=子ども', label: '「子ども」の記事をもっと見る' },
  unknown: { href: '/articles', label: '記事一覧を見る' },
};

const FITCHECK: Chip[] = [
  { label: 'ちょっと違う', value: '__diff' },
  { label: '別のことも聞きたい', value: '__other' },
];

// ── フロー ──
export function startFlow(): { state: FlowState; messages: BotMessage[] } {
  return {
    state: { step: 'topic' },
    messages: [
      {
        // 冒頭は選択肢を出さず、まず自由に書いてもらう入口にする（2026-07-09 フィードバック）
        kind: 'answer',
        text: 'ここは、離婚まわりの悩みを整理する場所です。無理に全部話さなくて大丈夫です。今、気になっていることを、お気軽に書いてみてください。',
      },
    ],
  };
}

function propose(topic: string, subtopic?: string): { state: FlowState; messages: BotMessage[] } {
  const cards = (CARDS[topic] || CARDS.unknown).slice(0, 3);
  const more = MORE[topic] || MORE.unknown;
  return {
    state: { step: 'propose', topic, subtopic },
    messages: [
      {
        kind: 'cards',
        text: '今すぐ全部やらなくて大丈夫です。まずはこの辺が助けになるかもしれません。読んでみて、近いか教えてください。',
        cards,
        moreHref: more.href,
        moreLabel: more.label,
      },
      {
        kind: 'chips',
        text: 'もし、どれもピンとこなかったら教えてください。今の状況をもう少し伺えれば、別の切り口で探します。',
        chips: FITCHECK,
      },
    ],
  };
}

/** チップ選択を処理して次の状態とメッセージを返す。 */
export function onChip(state: FlowState, value: string): { state: FlowState; messages: BotMessage[] } {
  if (value === '__other') return startFlow();
  if (value === '__diff') {
    return {
      state: { step: 'topic' },
      messages: [{ kind: 'chips', text: '失礼しました。もう少し教えてください。今の状況に近いのは、どれでしょうか？', chips: TOPICS }],
    };
  }
  if (state.step === 'topic') {
    const subs = SUBTOPICS[value];
    if (subs) {
      return {
        state: { step: 'subtopic', topic: value },
        messages: [{ kind: 'chips', text: 'そこは大事ですね。もう少しだけ絞らせてください。今いちばん頭にあるのは、どれでしょうか？', chips: subs }],
      };
    }
    return propose(value);
  }
  if (state.step === 'subtopic') {
    return propose(state.topic || 'unknown', value);
  }
  return { state, messages: [] };
}

// ── AI回答API（Phase C）：UIが /api/chat を叩く関数を注入する。既定はプレビュー用のダミー。 ──
export interface ChatApiResponse {
  kind: 'answer' | 'safe';
  text: string;
  source?: string;
  sourceHref?: string;
  cards?: Card[];
  suggestions?: string[]; // タップして次を送れる選択肢（AIが必要時のみ提案）
  moreHref?: string;
  moreLabel?: string;
  error?: string;
}
export type ChatApi = (message: string, deepen: number) => Promise<ChatApiResponse>;

// 既定＝サーバ未接続のプレビュー用ダミー（/styleguide 用）。デプロイ時は AiChat.astro が実APIを注入する。
const dummyApi: ChatApi = async () => ({
  kind: 'answer',
  text: '（デモ回答）ここに、記事の中身をもとにした短い答えが入る。金額算定や個別の法的判断はしない。範囲外は「扱っていない」と返す。',
  source: '（出典の記事名）',
});

// 往復上限（M-3・doc43§6「目安10往復」）。超えたら一覧・窓口へ案内してコスト暴走を防ぐ。
export const MAX_TURNS = 12;

/**
 * 自由入力を処理。①入力ガード（client側の即ブロック）②proceedなら往復をカウントし上限判定
 * ③api（既定=ダミー／本番=/api/chat）を叩いて回答を組み立て。危機等の安全応答は往復にカウントしない。
 */
// 計測イベント種別（M-8・GA4へ"件数だけ"送る。本文・PIIは絶対に載せない）。
export type FlowEvent =
  | 'guard_crisis' | 'guard_blocked_abuse' | 'guard_sealed' | 'guard_pii_refuse'
  | 'turn_limit' | 'degraded' | 'answer';

export async function onText(
  state: FlowState,
  text: string,
  api: ChatApi = dummyApi,
): Promise<{ state: FlowState; messages: BotMessage[]; event?: FlowEvent }> {
  const g = await screenInput(text);
  if (g.action !== 'proceed') {
    // 危機・攻撃・封印・PII拒否 → 生成せず定型（安全応答は常に返す・往復にカウントしない）
    const messages: BotMessage[] = [{ kind: 'safe', text: g.response || '' }];
    // 封印テーマは該当記事カードも付ける（例：養育費→算定ツールのある記事へ）
    if (g.article) messages.push({ kind: 'cards', text: '', cards: [g.article] });
    return { state, messages, event: `guard_${g.action}` as FlowEvent };
  }
  // proceed＝有料の生成経路。ここだけ往復をカウントし、上限で打ち切る（M-3）。
  const turns = (state.turns || 0) + 1;
  const deepen = state.deepen || 0; // これまでの深掘りターン数（サーバへ渡す）
  const next: FlowState = { ...state, turns };
  if (turns > MAX_TURNS) {
    return {
      state: next,
      messages: [{
        kind: 'chips',
        text: 'だいぶ一緒に整理できましたね。ここからは記事一覧や相談窓口も覗いてみてください。続けたいテーマがあれば選んでください。',
        chips: TOPICS,
      }],
      event: 'turn_limit',
    };
  }
  try {
    const r = await api(g.safeText || text, deepen);
    if (r.kind === 'safe' || r.error) {
      return { state: next, messages: [{ kind: 'safe', text: r.text || 'いま混み合っているようです。少し時間をおいてお試しください。' }], event: 'degraded' };
    }
    const messages: BotMessage[] = [{ kind: 'answer', text: r.text, source: r.source }];
    // 記事カードはサーバが「出す時だけ」返す（深掘り中は空／具体的な回答で入る）。
    // いきなりカードが出ると唐突なので、接続の一言を添える。
    if (r.cards && r.cards.length) {
      messages.push({ kind: 'cards', text: '詳しくは、こちらの記事も参考になるかもしれません。', cards: r.cards.slice(0, 3), moreHref: r.moreHref, moreLabel: r.moreLabel });
    }
    // 追撃チップは常設せず、AIが提案した選択肢がある時だけ（タップで次を送れる＝深掘りが続く）。
    const hasSug = !!(r.suggestions && r.suggestions.length);
    if (hasSug) {
      messages.push({
        kind: 'chips',
        text: '近いものがあれば、タップで教えてください（そのまま入力でも大丈夫です）。',
        chips: r.suggestions!.slice(0, 3).map((s) => ({ label: s, value: '__say' })),
      });
    }
    // 深掘り継続（選択肢あり）なら +1、記事を出した（選択肢なし）ならリセット。
    return { state: { ...next, deepen: hasSug ? deepen + 1 : 0 }, messages, event: 'answer' };
  } catch (e) {
    // 通信不調 → 静的縮退（記事サイト・窓口は生きている）
    return { state: next, messages: [{ kind: 'safe', text: 'うまく繋がりませんでした。少し時間をおいてお試しください。お急ぎの場合は記事一覧や相談窓口もご利用ください。' }], event: 'degraded' };
  }
}

// トピック→関心タグ（現在地=oretachi_state へ反映するための対応）
export const TOPIC_TO_KANSHIN: Record<string, string> = {
  money: 'お金',
  feelings: '気持ち',
  wife: '相談',
  kids: '子ども',
};

export const CHAT_GREETING_LABEL = 'AIで悩みを整理する';
