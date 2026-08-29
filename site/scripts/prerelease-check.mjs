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
import { join, dirname, basename } from 'node:path';
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
const escapeRe = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

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

// ── サイト全体の健全性（記事1本ごとではなく、ビルド全体に1回だけ） ──────────
// 2026-08-29 新設。Astro7移行時、index.astro が AMETA を a.slug で引いていて
// （Astro7では entry.slug が entry.id に変わり undefined になる）、全記事の
// メタ情報が既定値に落ちていた。ページは正常に表示されるので目視では気づけず、
// 「見える文字」と「DOM構造」の比較も、この値が <script type="application/json">
// の中にあるため素通りした。同じ形の事故を機械で止める。
function checkSiteWide() {
  console.log(`\n\x1b[1m── サイト全体 ──\x1b[0m`);
  // 1) Astroエントリの .slug は Astro5 以降 存在しない。AMETA/QMETA を引くキーに混ざると全件既定値になる
  const src = readdirSync(join(ROOT, 'src'), { recursive: true })
    .filter((f) => typeof f === 'string' && /\.(astro|ts|js)$/.test(f));
  const bad = [];
  for (const f of src) {
    const t = readFileSync(join(ROOT, 'src', f), 'utf-8');
    t.split('\n').forEach((line, i) => {
      if (/(AMETA|QMETA)\[[^\]]*\.slug\]/.test(line)) bad.push(`${f}:${i + 1}`);
    });
  }
  bad.length
    ? ng(`AMETA/QMETA を .slug で引いている（Astro5以降は undefined になり全件が既定値に落ちる）: ${bad.join(', ')}`)
    : ok('AMETA/QMETA の参照キーは .id');
  // 1b) content collection の走査範囲外に .md が置かれていないか。
  //     content.config.ts は「直下の .md のみ・_ 始まりは除外」に固定してある（理由はそのファイルのコメント）。
  //     範囲外に置いたファイルは"黙って無視される"ので、書いたのに公開されない事故を機械で拾う。
  for (const dir of ['articles', 'qa']) {
    const base = join(ROOT, 'src/content', dir);
    const stray = readdirSync(base, { recursive: true })
      .filter((f) => typeof f === 'string' && f.endsWith('.md'))
      .filter((f) => f.includes('/') || basename(f).startsWith('_'));
    stray.length
      ? wa(`src/content/${dir} に、公開対象外の .md が ${stray.length}件ある（下書きならOK。公開したいなら直下へ移し _ を外す）: ${stray.join(', ')}`)
      : ok(`src/content/${dir} に公開対象外の置き忘れなし`);
  }

  // 1c) 相談窓口の記述が正本（src/data/windows.ts）と矛盾していないか。
  //     窓口情報は記事・Q&A 29本にベタ書きでコピーされており、「1本を直しても他が古いまま」
  //     という事故が2026-08-29時点で5回起きている。危機のときに読む情報なので「気をつける」では止まらない。
  //     ※ .md はMDXではないためコンポーネント化できない。だから文章を共通化するのではなく、
  //       "正本との矛盾を機械で検出する" 方式にした（設計理由は src/data/windows.ts 冒頭）。
  //
  //     重大度を2つに分ける：
  //       ✗ 失敗 … 禁止表現がある（＝事実の誤り。例：いのちの電話に「24時間」）
  //       ▲ 警告 … 必須の注記が無い（＝省略。文脈により許容されうるが、読者が損をしうる）
  //
  //     照合範囲の決め方が肝。1行に複数の窓口が並ぶ（FAQの回答・出典欄）ため、
  //     単純に「番号の後ろN文字」を見ると隣の窓口の説明を誤って拾う。実際に誤検知した：
  //       「いのちの電話（0120-783-556・毎日16:00〜21:00）、…DV相談プラス（0120-279-889・24時間）」
  //       → いのちの電話に「24時間」があると誤判定
  //     そこで、行を"窓口の言及位置"で区間に切り、各窓口には自分の区間だけを見せる。
  //     区間は「前の窓口の言及の終わり〜次の窓口の言及の始まり」。
  //     これなら「16:00〜21:00なら いのちの電話 0120-783-556（無料）」のように
  //     注記が番号より前にある書き方も正しく拾える。
  {
    // 正本は JSON。以前はここで .ts を正規表現で読んでいたが、コメント行を挟んだ3件が
    // パターンから外れ、9件中6件しか検査されないまま**黙って素通り**していた。
    // しかも漏れていたのが DV相談プラス・#8008 という、いちばん事故の多い窓口だった。
    // 構文解析で落ちる余地を無くすため、サイト側と同じ JSON を直接読む。
    const wins = JSON.parse(readFileSync(join(ROOT, 'src/data/windows.json'), 'utf-8'));
    // 件数の下限を持たせる。将来また"黙って減る"事故が起きたら、ここで止まる。
    if (!Array.isArray(wins) || wins.length < 9) ng(`windows.json の窓口が ${wins?.length} 件しか読めていない（9件以上のはず。検査が骨抜きになっている）`);
    // 189 のような3桁は 0120-189-783 の一部にも一致するので、前後が数字・ハイフンでないことを要求する。
    const telRe = (t) => new RegExp((/^\d{3}$/.test(t) ? '(?<![0-9-])' : '') + escapeRe(t) + (/^\d{3}$/.test(t) ? '(?![0-9-])' : ''), 'g');
    let errs = 0, checked = 0; const omissions = [];
    for (const dir of ['articles', 'qa']) {
      for (const f of readdirSync(join(ROOT, 'src/content', dir)).filter((x) => x.endsWith('.md'))) {
        const lines = readFileSync(join(ROOT, 'src/content', dir, f), 'utf-8').split('\n');
        lines.forEach((line, li) => {
          // この行に出てくる全窓口の言及位置を集める
          const hits = [];
          for (const w of wins) for (const m of line.matchAll(telRe(w.tel))) hits.push({ w, at: m.index, end: m.index + w.tel.length });
          if (!hits.length) return;
          hits.sort((a, b) => a.at - b.at);
          hits.forEach((h, k) => {
            checked++;
            const from = k === 0 ? 0 : hits[k - 1].end;
            const to = k === hits.length - 1 ? line.length : hits[k + 1].at;
            let seg = line.slice(from, to);
            // 前の窓口の説明が閉じたところまで切り詰める。
            //   「よりそい（0120-279-338・24時間）やいのちの電話（0120-783-556・…）」
            //   のように、前の窓口の閉じ括弧の後ろから自分が始まるため、
            //   これをしないと隣の「24時間」を自分の注記だと誤って読む（実際に誤検知した）。
            //   区切りが無ければ切らない＝「16:00〜21:00なら いのちの電話 0120-…」のように
            //   注記が番号より前に置かれた書き方も拾える。
            const head = seg.slice(0, h.at - from);
            const cut = Math.max(head.lastIndexOf('）'), head.lastIndexOf(')'), head.lastIndexOf('、'), head.lastIndexOf('。'), head.lastIndexOf('／'));
            if (cut >= 0) seg = seg.slice(cut + 1);
            const miss = h.w.required.filter((r) => !seg.includes(r));
            for (const fb of h.w.forbidden) {
              if (!seg.includes(fb.phrase)) continue;
              // 必須注記が揃っているなら、その禁止語は対比表現の可能性が高い。実例：
              //   「#8008（…通話料がかかるので、無料で話したいなら上の0120へ）」
              //   ＝「無料」はあるが、正しい事実（通話料がかかる）もちゃんと書かれている。
              // 事実を書いたうえでの対比まで失敗にすると、正しい記事が公開できなくなる。
              // よって 失敗＝「正しい事実が抜けたまま禁止語がある」場合に限り、
              // それ以外は警告に落として人の目に回す。
              if (miss.length === 0) { omissions.push(`${dir}/${f}:${li + 1}　${h.w.name} に「${fb.phrase}」がある（${fb.why}）。正しい注記も併記＝対比表現かもしれない`); }
              else { errs++; ng(`${dir}/${f}:${li + 1}　${h.w.name} に「${fb.phrase}」（${fb.why}）。しかも正しい注記（${miss.join('・')}）が無い`); }
            }
            if (miss.length) omissions.push(`${dir}/${f}:${li + 1}　${h.w.name} に注記が無い（${miss.join('・')}）`);
          });
        });
        if (/\*\*\*\*/.test(lines.join('\n'))) { errs++; ng(`${dir}/${f}：アスタリスクが4つ連続（画面に生の ** が出る）`); }
      }
    }
    errs === 0 ? ok(`相談窓口に事実の誤りなし（${checked}箇所を正本と照合）`) : null;
    // 省略は「昔からある棚卸し」なので、1件ずつ叫ばずに集計して出す。
    // 全件見たいときは WINDOWS_VERBOSE=1 を付ける。
    if (omissions.length) {
      const byFile = {};
      for (const o of omissions) { const k = o.split('　')[0].split(':')[0]; (byFile[k] ||= []).push(o); }
      const files = Object.keys(byFile).sort((a, b) => byFile[b].length - byFile[a].length);
      wa(`相談窓口の注記の省略 ${omissions.length}件／${files.length}ファイル（事実の誤りではない。まとめて直す候補）`);
      if (process.env.WINDOWS_VERBOSE) omissions.forEach((o) => console.log(`      ${o}`));
      else files.slice(0, 5).forEach((k) => console.log(`      ${k}（${byFile[k].length}件）  例: ${byFile[k][0].split('　')[1]}`));
      if (!process.env.WINDOWS_VERBOSE) console.log(`      …全件は WINDOWS_VERBOSE=1 npm run check -- <slug> で表示`);
    } else ok('相談窓口の注記に省略なし');
  }

  // 1d) 文体ルールのうち「記事1本の検査では抜ける」もの。
  //     ダッシュ全面禁止は check(slug) で見ているが、あれは articles しか回らないため
  //     **Q&A側のダッシュが2026-08-29まで検出されていなかった**（実際に1件残っていた）。
  //     記事単位の検査には、対象ディレクトリの穴という構造的な死角がある。ここで両方を見る。
  {
    const dashed = [];
    for (const dir of ['articles', 'qa']) {
      for (const f of readdirSync(join(ROOT, 'src/content', dir)).filter((x) => x.endsWith('.md'))) {
        const t = readFileSync(join(ROOT, 'src/content', dir, f), 'utf-8');
        t.split('\n').forEach((l, i) => { if (/[――—―]/.test(l)) dashed.push(`${dir}/${f}:${i + 1}`); });
      }
    }
    dashed.length
      ? ng(`ダッシュ（――／—／―）が残っている（全面禁止）: ${dashed.join(', ')}`)
      : ok('ダッシュ不使用（記事・Q&A 両方を確認）');
  }

  // 1e) 引用（>）の直後に空行なしで地の文が続いていないか。
  //     Markdownの「遅延継続」で、その地の文が引用ブロックの中に描画される。
  //     2026-08-29に rikon-kiridasareta-saisho-14nichi.md で発見。
  //     「まず押さえる3つ」直下の "時間がない人、頭が回らない人は、ここだけ読めばいい。" が
  //     別記事への注釈の引用に飲み込まれ、**本番でそう表示されていた**。
  //     ソースを読んでいる限り気づけず、ビルド結果のHTMLを見ないと分からない種類の壊れ方。
  {
    const bad = [];
    for (const dir of ['articles', 'qa']) {
      for (const f of readdirSync(join(ROOT, 'src/content', dir)).filter((x) => x.endsWith('.md'))) {
        const L = readFileSync(join(ROOT, 'src/content', dir, f), 'utf-8').split('\n');
        for (let i = 0; i < L.length - 1; i++) {
          const cur = L[i], nxt = L[i + 1];
          if (cur.startsWith('>') && nxt.trim() && !nxt.startsWith('>') && !nxt.startsWith('#')) {
            bad.push(`${dir}/${f}:${i + 2}（${nxt.slice(0, 28)}…）`);
          }
        }
      }
    }
    bad.length
      ? ng(`引用（>）の直後に空行が無く、地の文が引用に飲み込まれる: ${bad.join(', ')}`)
      : ok('引用ブロックの閉じ忘れなし');
  }

  // 2) ビルド結果を実測：トップの adata/qdata が既定値に落ちていないか
  const top = readFileSync(join(DIST, 'index.html'), 'utf-8');
  for (const [id, need] of [['adata', 'phases'], ['qdata', 'phases']]) {
    const m = top.match(new RegExp(`<script[^>]*id="${id}"[^>]*>(.*?)</script>`, 's'));
    if (!m) { ng(`トップに ${id} が無い`); continue; }
    let rows;
    try { rows = JSON.parse(m[1].replace(/\\u003c/g, '<')); } catch { ng(`${id} がJSONとして壊れている`); continue; }
    const empty = rows.filter((r) => !Array.isArray(r[need]) || r[need].length === 0);
    empty.length === rows.length
      ? ng(`${id} 全${rows.length}件の ${need} が空。メタ情報の引き当てが全滅している（レコメンドが機能しない）`)
      : empty.length
        ? ng(`${id} の ${empty.length}/${rows.length}件で ${need} が空: ${empty.slice(0, 5).map((r) => r.slug).join(', ')}`)
        : ok(`${id} ${rows.length}件すべてにメタ情報が入っている`);
  }
}

if (arg === '--all') {
  for (const f of readdirSync(A_DIR).filter((f) => f.endsWith('.md'))) check(f.replace(/\.md$/, ''));
} else {
  check(arg.replace(/\.md$/, ''));
}
checkSiteWide();

console.log('\n' + '─'.repeat(60));
if (fails) {
  console.log(`\x1b[31m✗ ${fails}件の不備。内山さんに原稿を出す前に直すこと。\x1b[0m` + (warns ? ` （要確認 ${warns}件）` : ''));
  process.exit(1);
}
console.log(`\x1b[32m✓ 機械で見られるものは全部通った。\x1b[0m` + (warns ? ` （要確認 ${warns}件）` : ''));
console.log('  ※ 人が見るしかないもの（3層レビュー・事実の裏取り・読み物としての質）は別。');
