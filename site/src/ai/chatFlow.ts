// オレタチ AIチャット 会話フロー（Phase A・スタブ／doc43準拠）
// 純ロジック＝UIから切り離してテスト可能。API を呼ばない＝コスト¥0。
// 「探す（発見）」＝チップで絞ってカード提案。「調べる（回答）」＝自由入力→回答（今はダミー）。
// 入力ガード（危機/攻撃/封印/PII/インジェクション）は screenInput を通す＝実際に効く。
//
// テスト実行： node --experimental-strip-types src/ai/chatFlow.test.ts

import { screenInput } from './guards.ts';

export interface Chip { label: string; value: string; }
export interface Card { category: string; title: string; href: string; }
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
        kind: 'chips',
        text: 'ここは、離婚まわりの悩みを整理する場所だ。無理に全部話さなくていい。まずは、今いちばん気になっていることを教えてくれ。どれに近い？',
        chips: TOPICS,
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
        text: '今すぐ全部やらなくていい。まずこの辺が助けになるかもしれない。読んでみて、近いか教えてくれ。',
        cards,
        moreHref: more.href,
        moreLabel: more.label,
      },
      {
        kind: 'chips',
        text: 'もし、どれもピンとこなかったら教えてくれ。今の状況をもう少し聞ければ、別の切り口で探すよ。',
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
      messages: [{ kind: 'chips', text: 'そうか、ずれてたな。もう少し教えてくれ。今の状況に近いのは？', chips: TOPICS }],
    };
  }
  if (state.step === 'topic') {
    const subs = SUBTOPICS[value];
    if (subs) {
      return {
        state: { step: 'subtopic', topic: value },
        messages: [{ kind: 'chips', text: 'わかった、そこは大事だな。もう少しだけ絞らせてくれ。今いちばん頭にあるのは？', chips: subs }],
      };
    }
    return propose(value);
  }
  if (state.step === 'subtopic') {
    return propose(state.topic || 'unknown', value);
  }
  return { state, messages: [] };
}

/** 自由入力を処理。ガードを通し、通常なら「調べる（ダミー回答）」を返す。 */
export async function onText(state: FlowState, text: string): Promise<{ state: FlowState; messages: BotMessage[] }> {
  const g = await screenInput(text);
  if (g.action !== 'proceed') {
    // 危機・攻撃・封印・PII拒否 → 生成せず定型を返す
    return { state, messages: [{ kind: 'safe', text: g.response || '' }] };
  }
  // 調べる（Phase A はダミー。Phase C で RAG＋Claude に差し替え）
  return {
    state,
    messages: [
      {
        kind: 'answer',
        text: '（デモ回答）ここに、記事の中身をもとにした短い答えが入る。金額算定や個別の法的判断はしない。範囲外は「扱っていない」と返す。',
        source: '（出典の記事名）',
      },
      {
        kind: 'chips',
        text: 'この記事で詳しく読める。ほかに気になるところは？',
        chips: [{ label: '別のことを聞く', value: '__other' }],
      },
    ],
  };
}

// トピック→関心タグ（現在地=oretachi_state へ反映するための対応）
export const TOPIC_TO_KANSHIN: Record<string, string> = {
  money: 'お金',
  feelings: '気持ち',
  wife: '相談',
  kids: '子ども',
};

export const CHAT_GREETING_LABEL = 'AIで悩みを整理する';
