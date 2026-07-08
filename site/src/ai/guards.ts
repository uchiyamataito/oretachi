// オレタチ AI 入力ガード（F1.5⑤・命綱）
// doc42§4 / doc16§3-3 / specs/02§10 / doc43（会話仕様・入力ポリシー）準拠。
// 設計原則：見逃し < 誤検知（迷えば窓口へ）。生成の前段で危ういものを遮断する。
//
// このモジュールは Cloudflare Worker とブラウザの両方から使える純粋関数。
// API を呼ばない＝この層だけならコスト¥0でテスト可能。
// 危機検知の二段目（Haiku 意図分類）は CrisisStage2 フックで後付けする（今はスタブ）。
//
// テスト実行： node --experimental-strip-types src/ai/guards.test.ts

/** ガードの総合判定。crisis=助けへ / blocked_abuse=送信拒否 / sealed=生成停止 / proceed=（PIIマスキング後）生成へ。 */
export type GuardAction = 'crisis' | 'blocked_abuse' | 'sealed' | 'pii_refuse' | 'proceed';

export type AbuseReason = 'slur' | 'threat_direct' | 'threat_targeted';

export interface GuardResult {
  action: GuardAction;
  /** ユーザーに出す静的テンプレ（crisis / blocked_abuse / sealed / pii_refuse 時）。生成の代わりに表示する。 */
  response?: string;
  /** proceed 時に LLM へ渡す、PIIをマスキング済みの本文。 */
  safeText?: string;
  /** 封印テーマ時に案内する該当記事（クリックで飛べるカード。UIが表示）。 */
  article?: { href: string; title: string; category: string };
  /** 検知の内訳（ログ・テスト・デバッグ用。PIIの中身は残さない＝種別のみ）。 */
  detail: {
    crisisLevel: 'strong' | 'weak' | 'none';
    crisisMatched: string[];
    abuseReason: AbuseReason | null;
    sealedTopic: SealedTopic | null;
    piiTypes: PiiType[];
    injectionSuspected: boolean;
  };
}

export type SealedTopic =
  | 'money_zaisan' // 財産分与の金額算定
  | 'money_isharyo' // 慰謝料の金額算定
  | 'money_yoikuhi' // 養育費の金額算定
  | 'nenkin_bunkatsu' // 年金分割の法判断
  | 'shinken_outlook'; // 親権の見通し・確率

export type PiiType = 'mynumber' | 'credit_card' | 'bank_account' | 'phone' | 'email';

// ───────────────────────── 表記ゆれ正規化（C-1・命綱の前処理） ─────────────────────────
// 危機・攻撃・封印の"辞書照合"の前段でだけ使う。ひらがな/全角/空白/伏せ字での素通りを防ぐ。
//   ①NFKC（全角英数→半角・記号統一） ②カタカナ→ひらがな折り畳み ③空白・中黒・伏せ字記号の除去。
// 文末記号（、。！？）は短い語の誤爆を招くため"あえて残す"。LLMへ渡す本文にはこの正規化を使わない。
function toHiragana(s: string): string {
  return s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
}
export function normalizeForMatch(text: string): string {
  const base = toHiragana(text.normalize('NFKC').toLowerCase());
  // 空白（半角/全角）・中黒・アスタリスク・各種ハイフン/長音・アンダースコア・ピリオドを除去。
  return base.replace(/[\s　・*.\-‐―ー−_]/g, '');
}

// ───────────────────────── 危機検知（二段の一段目＝辞書） ─────────────────────────
// 危機＝"自分に向く"（死にたい等）。ここは弾かず、AIに渡さず窓口へ繋ぐ（寄り添い）。

// 強：単独で危機と判定して良い、ほぼ一義的な表現。
// かな読みも併記（C-1）。漢字表記の語をユーザーが全ひらがなで打つ場合（「しにたい」等）を拾う。
// カタカナ入力は normalizeForMatch でひらがなへ折り畳むため別掲不要。
const CRISIS_STRONG: string[] = [
  '死にたい', '死のう', '死ぬしかない', '死んだ方がいい', '死なせて',
  '殺してほしい', '殺してくれ', '私を殺', '俺を殺', '僕を殺',
  '自殺', '首を吊', '首吊り', '飛び降り', '飛び込み', 'リストカット', 'リスカ',
  '過量服薬', 'オーバードーズ', '練炭', '遺書', '楽に死ね', 'この世から消え',
  // ↓ かな読み（C-1）
  'しにたい', 'しのう', 'しぬしかない', 'しんだほうがいい', 'しなせて',
  'ころしてほしい', 'ころしてくれ', 'じさつ', 'くびつり', 'らくにしね', 'このよからきえ',
];

// 弱：文脈依存で危機の可能性。二段目（Haiku）で精緻化する前提。
// 今はスタブのため、既定ポリシー＝弱でも安全側に倒して窓口を出す（見逃し<誤検知）。
// 注：ありふれた語（単なる「疲れた」等）は誤検知が過大になるため入れない。
const CRISIS_WEAK: string[] = [
  '消えたい', '消えてしまいたい', 'いなくなりたい', 'いなくなった方がいい',
  'もう限界', 'もう疲れた', '生きるのに疲れた', '疲れ果てた',
  '生きる意味がない', '生きる価値がない', '生きている意味', '存在価値がない',
  '楽になりたい', '終わりにしたい', '終わらせたい', '全部投げ出したい',
  '目が覚めなければ', '目覚めたくない', 'どうなってもいい', '生きていたくない',
  // ↓ かな読み（C-1）
  'もうげんかい', 'いきるのにつかれた', 'つかれはてた', 'いきるいみがない',
  'いきるかちがない', 'いきているいみ', 'そんざいかちがない', 'めがさめなければ', 'いきていたくない',
];

// 照合はすべて normalizeForMatch 後のテキストで行う（辞書側も事前正規化）。
const CRISIS_STRONG_N = CRISIS_STRONG.map((k) => normalizeForMatch(k));
const CRISIS_WEAK_N = CRISIS_WEAK.map((k) => normalizeForMatch(k));

function detectCrisis(text: string): { level: 'strong' | 'weak' | 'none'; matched: string[] } {
  const n = normalizeForMatch(text);
  const strong = CRISIS_STRONG.filter((_, i) => CRISIS_STRONG_N[i] && n.includes(CRISIS_STRONG_N[i]));
  if (strong.length) return { level: 'strong', matched: strong };
  const weak = CRISIS_WEAK.filter((_, i) => CRISIS_WEAK_N[i] && n.includes(CRISIS_WEAK_N[i]));
  if (weak.length) return { level: 'weak', matched: weak };
  return { level: 'none', matched: [] };
}

/**
 * 危機検知の二段目（Haiku 意図分類）フック。
 * 今はスタブで null（未判定）を返す。実運用では Worker が Haiku を呼び、
 * true=危機 / false=非危機 を返して弱シグナルの誤検知を減らす。
 */
export type CrisisStage2 = (text: string) => Promise<boolean | null>;
const stage2Stub: CrisisStage2 = async () => null;

// ───────────────────────── 攻撃・脅迫・嫌がらせ（送信ブロック＝bucket2） ─────────────────────────
// 危機（死にたい＝自分に向く）は上で"助け"に回すのでここには入れない。
// ここは"他者に向く攻撃"や侮蔑・差別を、単語＋組み合わせで弾く。辞書はデータ＝内山さんが編集可。
// 注：単純一致だけだと誤爆（「殺すほど腹が立つ」等の慣用）が出るため、組み合わせと慣用除外で精度を上げる。

// 単独で成立する直接攻撃語（命令形＝他者に向く）。かな読み併記（C-1正規化と併用）
const ABUSE_DIRECT: string[] = ['死ね', 'しね', 'タヒね', '殺してやる', 'ころしてやる', 'ぶっ殺', 'ぶっころ', '殺すぞ', 'ころすぞ'];
// 侮蔑・差別スラー（内山さんが運用で追加。ここは最小の叩き台）
const ABUSE_SLUR: string[] = ['きもい死ね', 'くたばれ'];
// 対象語と組み合わさると攻撃になる暴力語（かな読み併記）
const VIOLENCE_COND: string[] = ['殺す', '殺し', '殺したい', 'ころす', 'ころし', 'ころしたい', '刺す', '殴る', 'なぐる', '襲う', 'おそう'];
// 攻撃の向け先（対象）
const ABUSE_TARGET: string[] = ['お前', 'おまえ', 'てめえ', 'てめー', 'あいつ', 'こいつ', '妻', '嫁', '奥さん', '運営', '管理人', 'お前ら'];

// 事前正規化済みの辞書（照合は normalizeForMatch 後のテキストで）
const ABUSE_DIRECT_N = ABUSE_DIRECT.map((w) => normalizeForMatch(w));
const ABUSE_SLUR_N = ABUSE_SLUR.map((w) => normalizeForMatch(w));
const VIOLENCE_COND_N = VIOLENCE_COND.map((w) => normalizeForMatch(w));
const ABUSE_TARGET_N = ABUSE_TARGET.map((w) => normalizeForMatch(w));
// 慣用（「殺すほど」「死ぬほど」等）は"その一致部分だけ"を除去し、残りで攻撃を判定する（H-1）
const IDIOM_RE = /(殺す|殺し|殺したい|ころす|ころし|ころしたい|死ぬ|死に|しぬ|しに)(ほど|くらい|ぐらい|そう)/g;

function detectAbuse(text: string): AbuseReason | null {
  const n = normalizeForMatch(text);
  if (ABUSE_SLUR_N.some((w) => w && n.includes(w))) return 'slur';
  if (ABUSE_DIRECT_N.some((w) => w && n.includes(w))) return 'threat_direct';
  // 慣用句の一致部分のみ除去（メッセージ全体の判定はスキップしない＝H-1バイパス封鎖）
  const residue = n.replace(IDIOM_RE, '');
  const hasViolence = VIOLENCE_COND_N.some((w) => w && residue.includes(w));
  const hasTarget = ABUSE_TARGET_N.some((w) => w && residue.includes(w));
  if (hasViolence && hasTarget) return 'threat_targeted';
  return null;
}

// ───────────────────────── 封印テーマ（金額算定・法判断・親権見通し） ─────────────────────────

// 「トピック語」×「個別の金額/見通しを求める意図語」が揃ったら封印。
const SEALED_RULES: { topic: SealedTopic; topicWords: string[]; intentWords: string[] }[] = [
  {
    topic: 'money_zaisan',
    topicWords: ['財産分与', '財産の分け', '退職金の分'],
    intentWords: ['いくら', '金額', '計算', '相場', '試算', '割合', '取り分', '何割', 'もらえる', '請求できる'],
  },
  {
    topic: 'money_isharyo',
    topicWords: ['慰謝料'],
    intentWords: ['いくら', '金額', '相場', '請求できる', '取れる', '払う', '計算', '払わない', '減らせ'],
  },
  {
    topic: 'money_yoikuhi',
    topicWords: ['養育費'],
    intentWords: ['いくら', '金額', '相場', '計算', '算定', '妥当', '減額', '払う', '払わない'],
  },
  {
    topic: 'nenkin_bunkatsu',
    topicWords: ['年金分割'],
    intentWords: ['いくら', '割合', '計算', '対象', '権利', 'できる', 'もらえる', '何割'],
  },
  {
    topic: 'shinken_outlook',
    topicWords: ['親権', '監護権'],
    intentWords: ['取れる', '勝てる', '取られ', '可能性', '確率', 'どっち', '有利', '不利', 'もらえる'],
  },
];

function detectSealed(text: string): SealedTopic | null {
  const n = normalizeForMatch(text);
  for (const rule of SEALED_RULES) {
    const hasTopic = rule.topicWords.some((w) => n.includes(normalizeForMatch(w)));
    const hasIntent = rule.intentWords.some((w) => n.includes(normalizeForMatch(w)));
    if (hasTopic && hasIntent) return rule.topic;
  }
  return null;
}

// ───────────────────────── PII 検知・マスキング ─────────────────────────

// 高リスク（送信を拒否＝そもそもLLMへ渡さない）：マイナンバー・カード・口座番号。
// 中リスク（マスキングして続行可）：電話・メール。
const PII_PATTERNS: { type: PiiType; risk: 'refuse' | 'mask'; re: RegExp }[] = [
  { type: 'credit_card', risk: 'refuse', re: /\b(?:\d[ -]?){15,16}\b/g },
  // マイナンバー：4-4-4 区切り、または 12桁連続（H-3・区切り表記も拾う）
  { type: 'mynumber', risk: 'refuse', re: /\b\d{4}[ -]\d{4}[ -]\d{4}\b/g },
  { type: 'mynumber', risk: 'refuse', re: /\b\d{12}\b/g },
  // 口座：金額文脈での誤爆回避のため複合語に限定（H-2）。「普通」「当座」単独では発火させない
  { type: 'bank_account', risk: 'refuse', re: /(口座番号|普通預金|普通口座|当座預金|当座口座|口座)[^\d]{0,6}\d{6,8}/g },
  { type: 'email', risk: 'mask', re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g },
  // 電話：長音「ー」・マイナス「−」・全角括弧起因の区切りも許容（H-3。前段NFKCで全角数字は半角化済み）
  { type: 'phone', risk: 'mask', re: /\b0\d{1,3}[-‐ー−(]?\d{2,4}[-‐ー−)]?\d{3,4}\b/g },
];

function detectPii(text: string): { types: PiiType[]; refuse: boolean; masked: string } {
  // NFKC で全角英数字・全角ハイフンを半角へ寄せてから検知（H-3）。
  // LLMへ渡す safeText もこの正規形（幅の統一のみ＝意味は保存。危機用の折り畳みは使わない）。
  const norm = text.normalize('NFKC');
  const types = new Set<PiiType>();
  let refuse = false;
  let masked = norm;
  for (const p of PII_PATTERNS) {
    if (p.re.test(norm)) {
      types.add(p.type);
      if (p.risk === 'refuse') refuse = true;
      masked = masked.replace(p.re, '［個人情報］');
    }
    p.re.lastIndex = 0; // /g のステート初期化
  }
  return { types: [...types], refuse, masked };
}

// ───────────────────────── プロンプトインジェクション検知 ─────────────────────────

const INJECTION_PATTERNS: RegExp[] = [
  /(これまで|上記|さっき|以前)の?(指示|命令|ルール|設定|プロンプト)を?(無視|忘れ|破棄|上書き)/,
  /(制約|ガード|規則)を?(解除|無視|外し|回避)/,
  /ignore\s+(all\s+)?(previous|above|prior)\s+(instructions?|prompts?)/i,
  /(system\s*prompt|システムプロンプト)/i,
  /(あなたは今から|今からあなたは|これからは君は).{0,20}(として|になりきって|振る舞|演じ)/,
  /developer\s*mode|開発者モード|脱獄|jailbreak|DAN/i,
];

function detectInjection(text: string): boolean {
  // 全角での回避に備えNFKCで幅を寄せる（空白は残すため \s+ を要するパターンは維持される）。
  const t = text.normalize('NFKC');
  return INJECTION_PATTERNS.some((re) => re.test(t));
}

// ───────────────────────── 静的テンプレ（生成の代わりに出す） ─────────────────────────

export const CRISIS_TEMPLATE =
  'つらい気持ちを話してくれてありがとう。いま、あなたの安全がいちばん大切だ。' +
  '一人で抱えなくていい。声を出さなくても頼れる窓口がある。\n' +
  '・よりそいホットライン 0120-279-338（24時間・無料）\n' +
  '・いのちの電話 0570-783-556\n' +
  '危険を感じるほどつらいときは、ためらわず上の窓口に連絡してくれ。';

export const ABUSE_TEMPLATE =
  'すまない、その内容は送れない。ここは離婚で悩む人が安心して使う場所だから、' +
  '攻撃的な言葉や嫌がらせには使えないんだ。困りごとがあるなら、力になる。';

const SEALED_TEMPLATES: Record<SealedTopic, string> = {
  money_zaisan:
    '財産分与の具体的な金額は、個別事情で大きく変わるためこのチャットでは算定できない。' +
    '考え方は「財産分与の対象・対象外」の記事にまとめてある。正確な金額は弁護士・公的窓口へ。',
  money_isharyo:
    '慰謝料の金額はケースごとの事情で決まるため、このチャットでは算定できない。' +
    '一般的な考え方は関連記事を、具体的な金額は専門家・公的窓口を頼ってくれ。',
  money_yoikuhi:
    '養育費の金額は算定表と個別事情で決まるため、このチャットでは算定しない。' +
    '「養育費」の記事に相場の考え方と算定ツールがある。最終的な金額は専門家・公的窓口へ。',
  nenkin_bunkatsu:
    '年金分割の対象や割合の法的な判断は、このチャットではできない。' +
    '手続きの流れは関連記事に、個別の可否は日本年金機構・専門家に確認してくれ。',
  shinken_outlook:
    '親権が取れるかどうかの見通しは、個別事情で変わるためこのチャットでは断定できない。' +
    '「父親の親権」の記事に条件と今からできることをまとめてある。個別の相談は専門家へ。',
};

// 封印テーマ→該当記事（金額算定はしないが、考え方・算定ツールのある記事へ誘導＝doc43§7）。
export const SEALED_LINKS: Record<SealedTopic, { href: string; title: string; category: string }> = {
  money_zaisan: { href: '/rikon-zaisan-bunyo-taishou', title: '財産分与の対象・対象外', category: 'お金' },
  money_isharyo: { href: '/qa/rikon-bekkyo-futei-isharyo', title: '不貞の慰謝料の考え方', category: 'お金' },
  money_yoikuhi: { href: '/rikon-yoikuhi', title: '養育費の相場と計算ツール', category: 'お金' },
  nenkin_bunkatsu: { href: '/rikon-nenkin-tetsuzuki', title: '年金分割の手続き', category: 'お金' },
  shinken_outlook: { href: '/rikon-shinken-chichioya', title: '父親の親権｜条件と今できること', category: '子ども' },
};

const PII_REFUSE_TEMPLATE =
  '安全のため、口座番号・カード番号・マイナンバーなどの個人情報は入力しないでくれ。' +
  'それらが無くても相談できる。番号を消して、もう一度送ってくれると助かる。';

// ───────────────────────── 総合判定（優先度：危機 > 攻撃 > 封印 > PII拒否 > 続行） ─────────────────────────

/**
 * 入力を評価して、生成前にどう扱うかを返す。
 * @param text ユーザー入力（生テキスト。ここでは保存しない）
 * @param stage2 危機の二段目分類（省略時はスタブ＝未判定）
 */
export async function screenInput(text: string, stage2: CrisisStage2 = stage2Stub): Promise<GuardResult> {
  const crisis = detectCrisis(text);
  const abuseReason = detectAbuse(text);
  const sealedTopic = detectSealed(text);
  const injectionSuspected = detectInjection(text);
  const pii = detectPii(text);

  const detail = {
    crisisLevel: crisis.level,
    crisisMatched: crisis.matched,
    abuseReason,
    sealedTopic,
    piiTypes: pii.types,
    injectionSuspected,
  };

  // 1) 危機：最優先（自分に向く＝助ける）。強は即・弱は二段目に諮り、未判定/陽性なら安全側で窓口へ。
  if (crisis.level === 'strong') {
    return { action: 'crisis', response: CRISIS_TEMPLATE, detail };
  }
  if (crisis.level === 'weak') {
    const verdict = await stage2(text); // null=未判定, true=危機, false=非危機
    if (verdict === true || verdict === null) {
      return { action: 'crisis', response: CRISIS_TEMPLATE, detail };
    }
    // verdict===false のときだけ通常フローへ落とす（誤検知を二段目で救済）
  }

  // 2) 攻撃・脅迫・嫌がらせ（他者に向く）：送信を拒否。
  if (abuseReason) {
    return { action: 'blocked_abuse', response: ABUSE_TEMPLATE, detail };
  }

  // 3) 封印テーマ：生成させず記事＋窓口へ。該当記事リンクも付ける。
  if (sealedTopic) {
    return { action: 'sealed', response: SEALED_TEMPLATES[sealedTopic], article: SEALED_LINKS[sealedTopic], detail };
  }

  // 4) 高リスクPII：送信を拒否して入れ直してもらう。
  if (pii.refuse) {
    return { action: 'pii_refuse', response: PII_REFUSE_TEMPLATE, detail };
  }

  // 5) 続行：中リスクPIIはマスキング済みの本文を渡す。インジェクション疑いはフラグで伝える。
  return { action: 'proceed', safeText: pii.masked, detail };
}
