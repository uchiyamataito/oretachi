// chatFlow.ts のユニットテスト（node --experimental-strip-types src/ai/chatFlow.test.ts）
import { startFlow, onChip, onText, type FlowState } from './chatFlow.ts';

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
  ok(tn.messages[0].kind === 'answer' && !!tn.messages[0].source, '通常→回答＋出典');

  console.log('\n===== chatFlow ユニットテスト =====');
  if (fails.length) console.log(fails.join('\n'));
  console.log(`\n合格 ${pass} / 失敗 ${fail}`);
  if (fail > 0) process.exit(1);
  console.log('✓ 全ケース通過');
}
main();
