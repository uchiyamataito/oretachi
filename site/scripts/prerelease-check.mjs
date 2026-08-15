#!/usr/bin/env node
// リリース前チェック（機械で検査できるものだけを全部見る）
//
//   使い方： npm run check -- <slug>      例) npm run check -- rikon-tsuma-ga-kowai
//            npm run check -- --all       全記事を検査（既存記事の棚卸し用）
//
// なぜ存在するか：
//   `article-pipeline/SKILL.md` に文章のチェックリストがあったが、読み飛ばせるため
//   実際に守れなかった（2026-08-14 までに「トップの時系列を忘れる」「タイトルで
//   予告した見出しが本文に無い」「本文を直して出典欄を直し忘れる」が発生）。
//   「書いてある」ではなく「通らないと出せない」に変えるためのもの。
//
//   ※ npm run build を先に済ませておくこと（dist/ の実出力を見るため）

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const A_DIR = join(ROOT, 'src/content/articles');
const DIST = join(ROOT, 'dist');

const arg = process.argv[2];
if (!arg) {
  console.error('使い方: npm run check -- <slug>  /  --all  /  --stamp <slug>');
  process.exit(2);
}

/** 本文（frontmatterを除く）のハッシュ。レビュー後に中身が変わったかを機械で見るため */
const bodyHash = (raw) => createHash('sha256').update(raw.split('---').slice(2).join('---')).digest('hex').slice(0, 16);

// --stamp：専門家レビューを通し終えた時点で押す。以後、本文を触ると check が落ちる
if (arg === '--stamp') {
  const slug = (process.argv[3] || '').replace(/\.md$/, '');
  const p = join(A_DIR, `${slug}.md`);
  if (!existsSync(p)) { console.error(`記事が無い: ${p}`); process.exit(2); }
  let raw = readFileSync(p, 'utf-8');
  const h = bodyHash(raw);
  raw = raw.replace(/^reviewed_hash: .*$\n/m, '');
  raw = raw.replace(/^(disclaimer: .*)$/m, `$1\nreviewed_hash: "${h}"`);
  writeFileSync(p, raw);
  console.log(`✓ ${slug} にレビュー済みの刻印を押した（${h}）`);
  console.log('  以後、本文を1文字でも変えると npm run check が落ちる。');
  console.log('  直したら、該当する専門家レビューを回し直してから、もう一度 --stamp すること。');
  process.exit(0);
}

let fails = 0;
let warns = 0;
const ok = (m) => console.log(`  \x1b[32m✓\x1b[0m ${m}`);
const ng = (m) => { fails++; console.log(`  \x1b[31m✗ ${m}\x1b[0m`); };
const wa = (m) => { warns++; console.log(`  \x1b[33m▲ ${m}\x1b[0m`); };

/** 既存記事の太字密度レンジ（1本だけ極端にならないための基準） */
function boldDensityRange() {
  const vals = readdirSync(A_DIR).filter((f) => f.endsWith('.md')).map((f) => {
    const b = readFileSync(join(A_DIR, f), 'utf-8').split('---').slice(2).join('---');
    const lines = b.split('\n').filter((l) => l.trim()).length;
    return lines ? (b.match(/\*\*[^*]+\*\*/g) || []).length / lines : 0;
  }).filter(Boolean).sort((a, b) => a - b);
  return [vals[0], vals[vals.length - 1]];
}

function check(slug) {
  console.log(`\n\x1b[1m━━ ${slug} ━━\x1b[0m`);
  const mdPath = join(A_DIR, `${slug}.md`);
  if (!existsSync(mdPath)) { ng(`記事ファイルが無い: ${mdPath}`); return; }
  const raw = readFileSync(mdPath, 'utf-8');
  const fm = raw.split('---')[1] || '';
  const body = raw.split('---').slice(2).join('---');
  const val = (k) => (fm.match(new RegExp(`^${k}: "(.+)"`, 'm')) || [])[1];

  console.log('\n【1】原稿');
  // 必須フロントマター
  for (const k of ['title', 'seo_title', 'description', 'target_keyword', 'canonical', 'published', 'updated', 'supervised_by', 'disclaimer']) {
    val(k) ? ok(`frontmatter ${k}`) : ng(`frontmatter ${k} が無い`);
  }
  // 最初のH2は「まず結論：」型（31記事中29記事の型）
  const h2s = [...body.matchAll(/^## (.+)$/gm)].map((m) => m[1]);
  /まず結論|先に結論|まず押さえる/.test(h2s[0] || '')
    ? ok(`最初のH2が結論型「${h2s[0]}」`)
    : ng(`最初のH2が結論型でない「${h2s[0]}」（サイト標準は「まず結論：」）`);
  // タイトルで予告したものが本文にあるか
  const t = val('title') || '';
  const heads = [...body.matchAll(/^#{2,3} (.+)$/gm)].map((m) => m[1]).join('\n');
  for (const promise of ['やってはいけない', 'NG', 'チェックリスト', '比較']) {
    if (t.includes(promise) && !heads.includes(promise) && !body.includes(promise)) {
      ng(`タイトルが「${promise}」を予告しているのに、本文に該当箇所が無い`);
    }
  }
  if (!/やってはいけない|NG|チェックリスト|比較/.test(t)) ok('タイトルの約束と本文の整合');
  // 文体ルール
  /[――—―]/.test(body) ? ng('ダッシュ（――／—／―）が使われている。全面禁止') : ok('ダッシュ不使用');
  // 出典番号の整合
  const used = new Set([...body.matchAll(/\[出典(\d+)\]/g)].map((m) => +m[1]));
  const listed = new Set([...body.matchAll(/^ {2}(\d+)\. /gm)].map((m) => +m[1]));
  const missing = [...used].filter((n) => !listed.has(n));
  const unused = [...listed].filter((n) => !used.has(n));
  missing.length ? ng(`本文の[出典${missing}]が出典一覧に無い`) : ok('本文の出典番号がすべて一覧にある');
  if (unused.length) wa(`出典一覧の ${unused} が本文から参照されていない`);
  // 窓口を載せたときの必須表記
  const hasWindow = /0120-|#8008|189（|110番/.test(body);
  if (hasWindow) {
    /番号[^。]{0,24}変わる|受付[^。]{0,24}変わる/.test(body) ? ok('「番号・受付時間は変わることがある」の注記') : ng('窓口を載せているのに「番号・受付時間は変わることがある」の注記が無い');
    // 相談先の親記事そのものは、自分にリンクできない
    slug === 'rikon-dansei-soudansaki' ? ok('相談先の親記事そのもの') :
      /rikon-dansei-soudansaki/.test(body) ? ok('相談先の親記事へのリンク') : ng('窓口を載せているのに相談先の親記事へリンクしていない');
    /\d{4}-\d{2}-\d{2}確認/.test(body) ? ok('出典に確認日が入っている') : ng('窓口の出典に確認日が無い');
  }
  // 太字の密度
  const [lo, hi] = boldDensityRange();
  const lines = body.split('\n').filter((l) => l.trim()).length;
  const d = (body.match(/\*\*[^*]+\*\*/g) || []).length / lines;
  d >= lo * 0.6 && d <= hi
    ? ok(`太字の密度 ${d.toFixed(2)}／行（既存 ${lo.toFixed(2)}〜${hi.toFixed(2)}）`)
    : wa(`太字の密度 ${d.toFixed(2)}／行が既存レンジ（${lo.toFixed(2)}〜${hi.toFixed(2)}）から外れている`);

  // レビュー後に本文が書き換わっていないか（今日いちばん危なかった失敗の再発防止）
  const stamped = (fm.match(/^reviewed_hash: "(.+)"/m) || [])[1];
  if (!stamped) {
    wa('レビュー済みの刻印が無い（専門家レビューを通したら npm run check -- --stamp <slug>）');
  } else if (stamped !== bodyHash(raw)) {
    ng('レビュー後に本文が変わっている。安全・法務に触る変更なら、該当レビューを回し直してから --stamp し直すこと');
  } else {
    ok('レビュー後、本文は変わっていない');
  }

  console.log('\n【2】配線');
  const meta = readFileSync(join(ROOT, 'src/data/meta.ts'), 'utf-8');
  meta.includes(`'${slug}'`) ? ok('meta.ts に登録済み') : ng('meta.ts に登録が無い（レコメンドに出ない）');
  const idx = readFileSync(join(ROOT, 'src/pages/index.astro'), 'utf-8');
  // 時系列は段階ごとに厳選する場所で、全記事を載せる設計ではない（実測48/85本）。
  // 新規公開時は入れる想定だが、既存の棚卸しで一律に落とすのは誤りなので警告に留める。
  idx.includes(`/${slug}'`) ? ok('index.astro の時系列に登録済み') : wa('index.astro の時系列に無い（新規公開なら要追加。既存記事は編集判断）');

  console.log('\n【3】実出力（dist）');
  const distFile = join(DIST, slug, 'index.html');
  if (!existsSync(distFile)) { ng(`dist に出力が無い。先に npm run build を実行`); return; }
  const html = readFileSync(distFile, 'utf-8');
  // 被リンク
  const pages = [];
  for (const d2 of ['', 'qa']) {
    const base = d2 ? join(DIST, d2) : DIST;
    if (!existsSync(base)) continue;
    for (const e of readdirSync(base, { withFileTypes: true })) {
      const p = join(base, e.name, 'index.html');
      if (e.isDirectory() && existsSync(p) && readFileSync(p, 'utf-8').includes(`href="/${slug}/"`)) pages.push(e.name);
    }
  }
  pages.length >= 5 ? ok(`被リンク ${pages.length}ページ（目安5以上）`) : ng(`被リンクが ${pages.length}ページしかない（目安5以上）`);
  // トップのカードと時系列（時系列はJSバンドル側に入る）
  const top = readFileSync(join(DIST, 'index.html'), 'utf-8');
  top.includes(slug) ? ok('トップのカードに掲載') : ng('トップに出ていない');
  const label = (idx.match(new RegExp(`\\{ l: '([^']+)', h: '/${slug}'`)) || [])[1];
  if (label) {
    const js = readdirSync(join(DIST, '_astro')).filter((f) => f.endsWith('.js'));
    js.some((f) => readFileSync(join(DIST, '_astro', f), 'utf-8').includes(label))
      ? ok(`トップの時系列に反映（ラベル「${label}」）`)
      : ng(`時系列のラベル「${label}」がJSバンドルに出ていない`);
  }
  // アンカーの実在
  const anchors = [...html.matchAll(/href="#([^"]+)"/g)].map((m) => m[1]);
  const ids = new Set([...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]));
  // 手書きリンクは %E3%81%.. の形で書かれることがある。デコードして突き合わせる
  const dead = [...new Set(anchors)].filter((a) => {
    if (ids.has(a)) return false;
    try { return !ids.has(decodeURIComponent(a)); } catch { return true; }
  });
  dead.length ? ng(`リンク先の無いアンカー: ${dead.join(', ')}`) : ok(`アンカー ${new Set(anchors).size}件すべて実在`);
  // 画像の実在（拡張子違いの事故を防ぐ）
  for (const m of html.matchAll(/(?:src|href)="(\/img\/[^"]+)"/g)) {
    existsSync(join(DIST, m[1])) ? null : ng(`画像が存在しない: ${m[1]}`);
  }
  ok('本文・ヒーロー画像の実在');
  // 構造化データ
  const types = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)]
    .map((m) => { try { return JSON.parse(m[1])['@type']; } catch { return null; } }).filter(Boolean);
  for (const need of ['Article', 'BreadcrumbList']) {
    types.includes(need) ? ok(`構造化データ ${need}`) : ng(`構造化データ ${need} が無い`);
  }
}

if (arg === '--all') {
  for (const f of readdirSync(A_DIR).filter((f) => f.endsWith('.md'))) check(f.replace(/\.md$/, ''));
} else {
  check(arg.replace(/\.md$/, ''));
}

console.log('\n' + '─'.repeat(60));
if (fails) {
  console.log(`\x1b[31m✗ ${fails}件の不備。内山さんに原稿を出す前に直すこと。\x1b[0m` + (warns ? ` （要確認 ${warns}件）` : ''));
  process.exit(1);
}
console.log(`\x1b[32m✓ 機械で見られるものは全部通った。\x1b[0m` + (warns ? ` （要確認 ${warns}件）` : ''));
console.log('  ※ 人が見るしかないもの（3層レビュー・事実の裏取り・読み物としての質）は別。');
