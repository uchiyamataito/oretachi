// chatFlow.ts のユニットテスト（node --experimental-strip-types src/ai/chatFlow.test.ts）
import { startFlow, onChip, onText, MAX_TURNS, type FlowState, type ChatApi } from './chatFlow.ts';

let pass = 0, fail = 0;
const fails: string[] = [];
function ok(cond: boolean, label: string, extra = '') {
  if (cond) pass++; else { fail++; fails.push(`✗ ${label} ${extra}`); }
}

async function main() {
  const s0 = startFlow();
  ok(s0.state.step === 'topic', '開始=topic');
  ok(s0.messages.length === 1 && s0.messages[0].kind === 'chips', '開始=chips');
  ok((s0.messages[0].chips || []).length === 5, 'トピック5件');

  const s1 = onChip(s0.state, 'money');
  ok(s1.state.step === 'subtopic' && s1.state.topic === 'money', 'money→subtopic', JSON.stringify(s1.state));
  ok((s1.messages[0].chips || []).length === 3, 'サブトピック3件');

  const s2 = onChip(s1.state, 'living');
  ok(s2.state.step === 'propose', 'living→propose');
  ok(s2.messages[0].kind === 'cards', '提案=cards');
  ok((s2.messages[0].cards || []).length === 3, 'カード3件');
  ok(!!s2.messages[0].moreHref && s2.messages[0].moreHref.includes('theme='), 'もっと見るリンク', s2.messages[0].moreHref || '');
  ok(s2.messages[1].kind === 'chips', 'フィットチェックchips');

  const sf = onChip(startFlow().state, 'feelings');
  ok(sf.state.step === 'propose' && sf.messages[0].kind === 'cards', 'feelings→直接提案');

  const sd = onChip(s2.state, '__diff');
  ok(sd.state.step === 'topic' && sd.messages[0].kind === 'chips', 'ちょっと違う→topic');

  const so = onChip(s2.state, '__other');
  ok(so.state.step === 'topic', '別のこと→開始');

  const tc = await onText({ step: 'topic' } as FlowState, 'もう死にたい');
  ok(tc.messages[0].kind === 'safe' && tc.messages[0].text.includes('よりそい'), '危機→窓口', tc.messages[0].text.slice(0, 20));

  const ta = await onText({ step: 'topic' } as FlowState, 'お前を殺す');
  ok(ta.messages[0].kind === 'safe' && ta.messages[0].text.includes('送れない'), '攻撃→ブロック');

  const ts = await onText({ step: 'topic' } as FlowState, '養育費はいくらもらえる');
  ok(ts.messages[0].kind === 'safe' && ts.messages[0].text.includes('養育費'), '封印→定型');

  const tn = await onText({ step: 'topic' } as FlowState, '婚姻費用って何ですか');
  ok(tn.messages[0].kind === 'answer' && !!tn.messages[0].source, '通常→回答＋出典(既定ダミー)');

  // ── Phase C 追加：API注入・往復上限・エラー縮退（doc45 M-3対応） ──
  const stubAnswer: ChatApi = async () => ({ kind: 'answer', text: '記事によればこうだ。', source: 'テスト記事', cards: [{ category: 'お金', title: 'A', href: '/a' }], moreHref: '/articles', moreLabel: 'もっと見る' });
  const ra = await onText({ step: 'topic' } as FlowState, '生活費について', stubAnswer);
  ok(ra.messages[0].kind === 'answer' && ra.messages[0].text.includes('記事によれば') && ra.messages[0].source === 'テスト記事', 'API注入→回答＋出典');
  ok(ra.messages[1].kind === 'cards' && (ra.messages[1].cards || []).length === 1, 'API注入→カード');
  ok(ra.messages[2].kind === 'chips', 'API注入→続けるchips');
  ok(ra.state.turns === 1, '往復カウント=1');

  const stubSafe: ChatApi = async () => ({ kind: 'safe', text: 'いま混み合っている' });
  const rs = await onText({ step: 'topic' } as FlowState, '生活費について', stubSafe);
  ok(rs.messages[0].kind === 'safe' && rs.messages[0].text.includes('混み合って'), 'APIがsafe→safe');

  const stubThrow: ChatApi = async () => { throw new Error('network'); };
  const re = await onText({ step: 'topic' } as FlowState, '生活費について', stubThrow);
  ok(re.messages[0].kind === 'safe' && re.messages[0].text.includes('繋がらなかった'), '通信不調→縮退');

  const rt = await onText({ step: 'topic', turns: MAX_TURNS } as FlowState, '婚姻費用って何ですか', stubAnswer);
  ok(rt.messages[0].kind === 'chips', '往復上限→打ち切り(chips)');
  ok(rt.state.turns === MAX_TURNS + 1, '上限超過で往復記録');

  const rc = await onText({ step: 'topic', turns: 99 } as FlowState, '死にたい', stubThrow);
  ok(rc.messages[0].kind === 'safe' && rc.messages[0].text.includes('よりそい'), '危機は上限無視で窓口');

  // ── M-8：計測イベント種別（GA4へ件数のみ送出する用） ──
  ok(tc.event === 'guard_crisis', 'event=危機');
  ok(ta.event === 'guard_blocked_abuse', 'event=攻撃');
  ok(ts.event === 'guard_sealed', 'event=封印');
  ok(ra.event === 'answer', 'event=回答');
  ok(re.event === 'degraded', 'event=縮退');
  ok(rt.event === 'turn_limit', 'event=往復上限');

  console.log('\n===== chatFlow ユニットテスト =====');
  if (fails.length) console.log(fails.join('\n'));
  console.log(`\n合格 ${pass} / 失敗 ${fail}`);
  if (fail > 0) process.exit(1);
  console.log('✓ 全ケース通過');
}
main();
