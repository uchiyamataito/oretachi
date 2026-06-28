// 記事・Q&A の共通メタ（単一の元データ）。トップ(index)・記事一覧・Q&A一覧で共用する。
// phases=段階（時系列）, kanshin=テーマ（関心）, kids=子ども関連, route=復縁/離婚, pick=編集部ピック, rank=人気順, tag=表示タグ
// spouse_contact=妻との接点（やり取り）あり＝公開前レビューで「心理カウンセラー＋恋愛・夫婦カウンセラー」を必ず通す印（表示・SEOには不使用）
export const AMETA: Record<string, any> = {
  'rikon-kiridasareta-saisho-14nichi': { phases: ['切り出された直後'], kanshin: ['気持ち'], kids: false, spouse_contact: true, pick: true, rank: 1, pri: 2, tag: '気持ち・初動' },
  'rikon-nani-kara-hajimeru':          { phases: ['切り出された直後', '協議・調停中'], kanshin: ['手続き'], kids: false, pick: true, rank: 6, pri: 2, tag: '全体マップ' },
  'rikon-okane-checklist':             { phases: ['切り出された直後', '別居'], kanshin: ['お金'], kids: false, rank: 5, tag: 'お金' },
  'rikon-dansei-soudansaki':           { phases: ['切り出された直後', '協議・調停中'], kanshin: ['相談', '気持ち'], kids: false, pick: true, rank: 7, pri: 2, tag: '相談' },
  'rikon-mada-wakaretakunai':          { phases: ['切り出された直後'], kanshin: ['気持ち'], kids: false, spouse_contact: true, rank: 8, tag: '気持ち', route: 'fukuen' },
  'rikon-kenkohoken-tetsuzuki':        { phases: ['別居', '成立後'], kanshin: ['手続き', 'お金'], kids: false, rank: 9, tag: '手続き', route: 'rikon' },
  'rikon-kodomo-hoken':                { phases: ['別居', '成立後'], kanshin: ['子ども', '手続き'], kids: true, tag: '子ども', route: 'rikon' },
  'rikon-nenkin-tetsuzuki':            { phases: ['成立後'], kanshin: ['手続き', 'お金'], kids: false, tag: '手続き', route: 'rikon' },
  'rikon-fuyou-zeikin':                { phases: ['成立後'], kanshin: ['お金', '手続き'], kids: false, tag: 'お金', route: 'rikon' },
  'rikon-seimeihoken-sonomama':        { phases: ['成立後'], kanshin: ['お金', '手続き'], kids: false, tag: 'お金', route: 'rikon' },
  'rikon-seimeihoken-uketorinin':      { phases: ['成立後'], kanshin: ['お金', '手続き'], kids: false, tag: '手続き', route: 'rikon' },
  'rikon-bekkyo':                      { phases: ['切り出された直後', '別居'], kanshin: ['手続き', 'お金'], kids: false, spouse_contact: true, pick: true, rank: 3, pri: 3, tag: '別居' },
  'rikon-kaesu-kotoba':                { phases: ['切り出された直後'], kanshin: ['気持ち', '相談'], kids: false, spouse_contact: true, pick: true, rank: 2, pri: 3, tag: '気持ち・初動' },
  'rikon-fukuen-shuufuku':             { phases: ['切り出された直後', '別居', '修復'], kanshin: ['気持ち', '相談'], kids: false, spouse_contact: true, pick: true, rank: 4, pri: 3, tag: '復縁・修復', route: 'fukuen' },
  'rikon-saishuppatsu':                { phases: ['成立後', '再出発'], kanshin: ['気持ち', '相談'], kids: false, tag: '再出発', route: 'rikon' },
  'rikon-shinken-chichioya':           { phases: ['協議・調停中', '成立後'], kanshin: ['子ども', '手続き'], kids: true, pri: 3, tag: '親権', route: 'rikon' },
};
export const QMETA: Record<string, any> = {
  'rikon-hokensho-dousuru':        { phases: ['別居', '成立後'], kanshin: ['手続き', 'お金'], route: 'rikon' },
  'rikon-riyuu-toitsumeru':        { phases: ['切り出された直後'], kanshin: ['気持ち'], spouse_contact: true, route: 'fukuen' },
  'rikon-ie-deru-beki':            { phases: ['切り出された直後', '別居'], kanshin: ['手続き', 'お金'], spouse_contact: true },
  'rikon-kodomo-setsumei':         { phases: ['切り出された直後'], kanshin: ['子ども', '気持ち'] },
  'rikon-kyouyu-kouza-ugokasu':    { phases: ['切り出された直後', '別居'], kanshin: ['お金'] },
  'rikon-kiridasareta-atama-masshiro': { phases: ['切り出された直後'], kanshin: ['気持ち'] },
  'rikon-nemurenai-byoin':         { phases: ['切り出された直後'], kanshin: ['気持ち'] },
  'rikon-kiridasareta-mazu-nani':  { phases: ['切り出された直後'], kanshin: ['気持ち', '相談'], spouse_contact: true },
  'rikon-shuufuku-ng':             { phases: ['切り出された直後'], kanshin: ['気持ち'], spouse_contact: true, route: 'fukuen' },
  'rikon-kiridashita-gawa-koukai': { phases: ['切り出された直後'], kanshin: ['気持ち'], spouse_contact: true, route: 'fukuen' },
  'rikon-yori-modosu-kakuritsu':   { phases: ['切り出された直後'], kanshin: ['気持ち'], spouse_contact: true, route: 'fukuen' },
  'rikon-bekkyo-nannen':           { phases: ['切り出された直後', '別居'], kanshin: ['手続き', '気持ち'], spouse_contact: true, route: 'rikon' },
  'rikon-bekkyo-seikatsuhi':       { phases: ['別居'], kanshin: ['お金', '手続き'], route: 'rikon' },
  'rikon-chichioya-shinken':       { phases: ['協議・調停中', '成立後'], kanshin: ['子ども', '手続き'], route: 'rikon' },
  'rikon-yoikuhi-itsumade':        { phases: ['成立後'], kanshin: ['お金', '子ども'], route: 'rikon' },
  'rikon-yoikuhi-harawarenai':     { phases: ['成立後'], kanshin: ['お金', '手続き'], route: 'rikon' },
  'rikon-zaisan-zeikin-shakkin':   { phases: ['協議・調停中', '成立後'], kanshin: ['お金', '手続き'], route: 'rikon' },
  'rikon-kiridasareru-otto-tokuchou': { phases: ['切り出された直後'], kanshin: ['気持ち'], spouse_contact: true, route: 'fukuen' },
  'rikon-jibun-ga-warui':          { phases: ['切り出された直後'], kanshin: ['気持ち', '相談'] },
  'rikon-tsuma-rikon-sign':        { phases: ['切り出された直後'], kanshin: ['気持ち'], spouse_contact: true, route: 'fukuen' },
  'rikon-kodomo-eikyou':           { phases: ['切り出された直後', '成立後'], kanshin: ['子ども', '気持ち'] },
};

// 絞り込み用の軸（ラベルは表示名、value はメタ内の値と一致させる）
export const THEMES = [
  { v: 'お金', t: 'お金' },
  { v: '手続き', t: '手続き' },
  { v: '気持ち', t: '気持ち' },
  { v: '子ども', t: '子ども' },
  { v: '相談', t: '相談' },
];
export const PHASES = [
  { v: '切り出された直後', t: '切り出し直後' },
  { v: '別居', t: '別居' },
  { v: '協議・調停中', t: '協議・調停' },
  { v: '成立後', t: '成立後' },
];
