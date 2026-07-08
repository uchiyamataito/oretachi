// 記事一覧・Q&A一覧で共有する絞り込み＋関連度検索。
// テーマ（複数）×段階（時系列・単一）×キーワード（本文込み・関連度順）。
// cardSelector: '.card'（記事）/ '.qa-card'（Q&A）。両ページとも #sidx/#cards/#kw/#browse/#count/#empty を持つ前提。
export function initBrowse(cardSelector) {
  var idx = {};
  try {
    JSON.parse((document.getElementById('sidx') || {}).textContent || '[]').forEach(function (r) { idx[r.slug] = r; });
  } catch (e) {}

  var container = document.getElementById('cards');
  if (!container) return;
  var cards = [].slice.call(container.querySelectorAll(cardSelector));
  var original = cards.slice();
  var kw = document.getElementById('kw');
  var count = document.getElementById('count');
  var empty = document.getElementById('empty');
  var themes = new Set();
  var phase = '';

  // 関連度：タイトル一致×3／タグ・説明×2／本文×1。複数語は全語ヒットを条件に合算。
  function kwScore(rec, terms) {
    var s = 0, all = true;
    for (var i = 0; i < terms.length; i++) {
      var term = terms[i], hit = 0;
      if (rec.t.indexOf(term) > -1) hit += 3;
      if (rec.s.indexOf(term) > -1) hit += 2;
      if (rec.b.indexOf(term) > -1) hit += 1;
      if (hit === 0) all = false;
      s += hit;
    }
    return { match: all, score: s };
  }

  function apply() {
    var q = (kw.value || '').trim().toLowerCase();
    var terms = q ? q.split(/[\s　]+/).filter(Boolean) : [];
    var n = 0, vis = [];
    cards.forEach(function (c) {
      var ks = (c.getAttribute('data-kanshin') || '').split('|').filter(Boolean);
      var ps = (c.getAttribute('data-phases') || '').split('|').filter(Boolean);
      var okTheme = themes.size === 0 || ks.some(function (k) { return themes.has(k); });
      var okPhase = !phase || ps.indexOf(phase) > -1;
      var rec = idx[c.getAttribute('data-slug')] || { t: '', s: '', b: '' };
      var sc = terms.length ? kwScore(rec, terms) : { match: true, score: 0 };
      var show = okTheme && okPhase && sc.match;
      c.style.display = show ? '' : 'none';
      if (show) { n++; vis.push({ c: c, score: sc.score }); }
    });
    if (terms.length) { // キーワードあり＝関連度順
      vis.sort(function (a, b) { return b.score - a.score; });
      vis.forEach(function (v) { container.appendChild(v.c); });
    } else { // キーワードなし＝元の並び（新着順）に戻す
      original.forEach(function (c) { container.appendChild(c); });
    }
    count.textContent = n + '件';
    empty.hidden = n !== 0;
  }

  function syncChips() {
    document.querySelectorAll('#browse .chips[data-group="theme"] .ch').forEach(function (x) {
      x.classList.toggle('active', themes.has(x.getAttribute('data-v')));
    });
    document.querySelectorAll('#browse .chips[data-group="phase"] .ch').forEach(function (x) {
      x.classList.toggle('active', phase === x.getAttribute('data-v'));
    });
    var tc = document.querySelector('.facet-clear[data-clear="theme"]');
    var pc = document.querySelector('.facet-clear[data-clear="phase"]');
    if (tc) tc.hidden = themes.size === 0;
    if (pc) pc.hidden = phase === '';
  }

  document.querySelectorAll('#browse .chips').forEach(function (group) {
    var g = group.getAttribute('data-group');
    group.querySelectorAll('.ch').forEach(function (b) {
      b.addEventListener('click', function () {
        var v = b.getAttribute('data-v');
        if (g === 'theme') { themes.has(v) ? themes.delete(v) : themes.add(v); }
        else { phase = (phase === v) ? '' : v; }
        syncChips(); apply();
      });
    });
  });
  document.querySelectorAll('.facet-clear').forEach(function (fc) {
    fc.addEventListener('click', function () {
      if (fc.getAttribute('data-clear') === 'theme') { themes.clear(); } else { phase = ''; }
      syncChips(); apply();
    });
  });
  // キーワードは「検索実行（Enter）」または検索欄の×クリアで反映する。
  // スマホで1文字ごとに裏で絞り込まれる違和感を避け、Enterでキーボードも閉じる。
  kw.addEventListener('search', apply);
  kw.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { apply(); kw.blur(); }
  });
  var clearAll = document.getElementById('clear');
  if (clearAll) clearAll.addEventListener('click', function () {
    themes.clear(); phase = ''; kw.value = '';
    syncChips(); apply();
  });

  // URLパラメータ（?theme=お金,気持ち&phase=別居）で初期絞り込みを適用。
  // AIチャットの「もっと見る」など、絞り込み適用済みで一覧へ送客する導線から使う。
  // 値は既存チップに存在するものだけ採用（不正値は無視）。
  try {
    var params = new URLSearchParams(location.search);
    var validThemes = {};
    document.querySelectorAll('#browse .chips[data-group="theme"] .ch').forEach(function (x) { validThemes[x.getAttribute('data-v')] = 1; });
    var tParam = params.get('theme');
    if (tParam) tParam.split(',').forEach(function (v) { v = v.trim(); if (validThemes[v]) themes.add(v); });
    var validPhases = {};
    document.querySelectorAll('#browse .chips[data-group="phase"] .ch').forEach(function (x) { validPhases[x.getAttribute('data-v')] = 1; });
    var pParam = (params.get('phase') || '').trim();
    if (pParam && validPhases[pParam]) phase = pParam;
  } catch (e) { /* パラメータ無し/不正でも通常表示 */ }

  syncChips(); apply();
}
