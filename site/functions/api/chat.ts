// オレタチ AI 中継 Worker（Cloudflare Pages Function・Phase C／doc42§2・§3・§6・§7）
// 役割＝APIキーを隠し、入力ガードをサーバ側で再実行（doc44 H-5）し、RAG検索→Claude→出力ガード→出典付与。
//
// ⚠️ この層はブラウザに出さない。APIキー等の秘密は Cloudflare の暗号化環境変数から読む（コードに書かない）。
// ⚠️ サンドボックスでは実行できない（Cloudflare ランタイム前提）。デプロイ時に wrangler/Pages で動作確認する。
//
// 実際に課金が発生するのは「Claude 呼び出し」と「Workers AI 埋め込み」だけ。
// それ以外（ガード・検索・レート制限・予算カウンタ）は無料。予算超過・キル時は静的窓口へ縮退する。

import { screenInput } from '../../src/ai/guards.ts';
import { searchChunks, hitsToCards, type EmbeddedChunk } from '../../src/ai/ragSearch.ts';
import { guardOutput, OUTPUT_FALLBACK } from '../../src/ai/outputGuard.ts';
import { SYSTEM_GUARDS, buildUserContent } from '../../src/ai/systemPrompt.ts';

// Cloudflare のバインディング。ダッシュボード/wrangler.toml で設定する（デプロイ時）。
interface Env {
  // 秘密（暗号化環境変数）
  ANTHROPIC_API_KEY: string; // sk-ant-… ※クライアントに絶対出さない。これが有る=本番課金モード
  TURNSTILE_SECRET: string; // Turnstile 秘密鍵
  // バインディング
  AI: { run: (model: string, input: Record<string, unknown>) => Promise<any> }; // Workers AI（埋め込み生成・無料枠）
  ASSETS: { fetch: (input: Request | string | URL) => Promise<Response> }; // 静的アセット（埋め込みJSONの読込。Pages既定）
  RATE_KV?: KVNamespace; // レート制限・予算カウンタ
  // 設定（通常の環境変数・任意。未設定なら既定値）
  AICHAT_OFF?: string; // '1'/'true' でキルスイッチ（=このAPIの生成を止める。ただし危機等の安全応答は返す）
  MODEL_ANSWER?: string; // 回答モデル（既定 claude-sonnet-5）
  EMBED_MODEL?: string; // 埋め込みモデル（既定 @cf/baai/bge-m3＝多言語・日本語対応・1024次元）
  CARD_MIN_SCORE?: string; // 記事カードを出す最小類似度（既定 0.5。実クエリで要調整）
  MAX_DEEPEN?: string; // 深掘りの最大ターン数（既定 3。この数で打ち切り記事を出す）
  MONTHLY_REQUEST_CAP?: string; // 月次リクエスト上限（既定 300）
  RATE_PER_MIN?: string; // 1IPあたり毎分上限（既定 8）
}

interface KVNamespace {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>;
}

// 埋め込み済みチャンクは静的ファイル（/rag_embeddings.json）として置き、実行時に読み込む。
// 理由：数MBあるため Worker スクリプトへ同梱するとサイズ上限（無料枠1MB）を超える。
// isolate 内でメモリキャッシュし、2回目以降は再取得しない。未生成/失敗時は空配列＝安全に「扱っていない」。
let CHUNKS_CACHE: EmbeddedChunk[] | null = null;
async function getChunks(env: Env, request: Request): Promise<EmbeddedChunk[]> {
  if (CHUNKS_CACHE) return CHUNKS_CACHE;
  try {
    const res = await env.ASSETS.fetch(new URL('/rag_embeddings.json', request.url));
    if (!res.ok) return (CHUNKS_CACHE = []);
    const data = (await res.json()) as EmbeddedChunk[];
    return (CHUNKS_CACHE = Array.isArray(data) ? data : []);
  } catch {
    return (CHUNKS_CACHE = []);
  }
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });

// フォールバック応答（AI不調・予算超過・キル時）。記事サイトは通常稼働のまま。
const DEGRADED = {
  kind: 'safe',
  text: 'いま相談が混み合っているようです。少し時間をおいてお試しください。お急ぎの場合は、記事一覧や公的な相談窓口もご利用ください。',
};

// カードのカテゴリ → 一覧の絞り込みテーマ（browse.js の theme＝お金/気持ち/子ども/相談）。合わなければ空。
function deriveTheme(category?: string): string {
  const c = category || '';
  if (/お金|生活|費用|手続/.test(c)) return 'お金';
  if (/子ども|親権|養育/.test(c)) return '子ども';
  if (/気持ち|心構え|メンタル/.test(c)) return '気持ち';
  if (/相手|妻|修復|復縁|相談/.test(c)) return '相談';
  return '';
}

export const onRequestPost: (ctx: { request: Request; env: Env }) => Promise<Response> = async ({ request, env }) => {
  // 1) 入力の受け取り＋基本バリデーション
  let body: { message?: string; turnstileToken?: string; deepen?: number };
  try { body = await request.json(); } catch { return json({ error: 'bad_request' }, 400); }
  const message = (body.message || '').toString();
  if (!message.trim()) return json({ error: 'empty' }, 400);

  // 2) 【安全最優先・H-2】入力ガードをサーバ側で"先に"実行する。
  //    危機・攻撃・封印・PII は Claude を呼ばない＝課金ゼロ。よって Turnstile/予算/キルより前に走らせ、
  //    混雑時・停止時・ボット判定時でも「危機なら必ず窓口に落ちる」ことを保証する（doc44 H-5＋命綱）。
  //    長文でも正規表現は軽いので、先頭 4000 字だけ見て判定コストを抑える。
  const g = await screenInput(message.slice(0, 4000));
  if (g.action !== 'proceed') {
    return json({ kind: 'safe', text: g.response || DEGRADED.text, guard: g.action, article: g.article });
  }
  // ここから先は「通常生成（proceed）」＝有料APIを呼ぶ経路。以降でコスト系のゲートをかける。
  const safeText = (g.safeText || message).slice(0, 1000); // 入力長上限（M-4）＝APIへ渡す本文を制限

  // 3) キルスイッチ（生成だけ止める。安全応答は上で既に処理済み）
  if (env.AICHAT_OFF === '1' || env.AICHAT_OFF === 'true') return json(DEGRADED);

  // 4) 【フェイルクローズ・H-3】本番課金モード（APIキー有り）なのに保護（Turnstile秘密鍵・KV）が未設定なら、
  //    無防備に課金させず縮退する。設定漏れで"静かに無防備"になるのを防ぐ。
  const charging = !!env.ANTHROPIC_API_KEY;
  if (charging && (!env.TURNSTILE_SECRET || !env.RATE_KV)) {
    console.error('[chat] 本番課金モードだが TURNSTILE_SECRET / RATE_KV が未設定。フェイルクローズで縮退。');
    return json(DEGRADED);
  }

  // 5) Turnstile 検証（ボット/連投対策）
  const okHuman = await verifyTurnstile(env.TURNSTILE_SECRET, body.turnstileToken, request);
  if (!okHuman) return json({ error: 'turnstile' }, 403);

  // 6) レート制限＋予算カウンタ（KV。超過でグレースフルに縮退＝課金を止める）
  const ip = request.headers.get('cf-connecting-ip') || 'anon';
  const budget = await checkBudget(env, ip);
  if (!budget.ok) return json(DEGRADED);

  try {
    // 7) クエリを埋め込み → RAG検索（ヒットが無くてもよい＝共感・心構え層は根拠不要。事実は参考記事の範囲で）
    const queryVec = await embed(env, safeText);
    const chunks = await getChunks(env, request);
    const hits = searchChunks(queryVec, chunks, {});

    // 深掘りの上限。クライアントが「これまでの深掘り回数」を deepen で送る。上限に達したら質問を打ち切り記事へ。
    const maxDeepen = Number(env.MAX_DEEPEN || '3');
    const deepen = Math.max(0, Number(body.deepen || 0));
    const finalTurn = deepen >= maxDeepen - 1; // 例：max=3 なら deepen=2（=3ターン目）で打ち切り

    // 8) Claude で回答生成（二層：共感は自由に温かく／事実は参考記事の範囲）＝ここで課金（数円）
    const raw = await callClaude(env, safeText, hits, finalTurn);

    // 8-2) 末尾の [[NEXT]] 選択肢を分離（あれば。タップで次を送れるチップにする）
    let answer = raw;
    let suggestions: string[] = [];
    const parts = raw.split(/\[\[NEXT\]\]/);
    if (parts.length > 1) {
      answer = parts[0].trim();
      suggestions = parts[1].split('|').map((s) => s.trim()).filter(Boolean).slice(0, 3);
    }
    // 関連性の高いヒット。これがあれば「深掘りせず記事を出す」＝追加質問（選択肢）は曖昧で記事が無い時だけ。
    const cardMin = Number(env.CARD_MIN_SCORE || '0.6');
    const relevant = hits.filter((h) => h.score >= cardMin);
    // 記事が見つかった or 深掘り上限 なら、選択肢（追加質問）を出さない＝そのまま記事へ案内。
    if (relevant.length > 0 || finalTurn) suggestions = [];

    // 9) 出力ガード（金額算定/個別法判断/過度な確約/商品推奨 を差し止め。共感応答は出典が無くても通す）
    const guarded = guardOutput(answer, hits.length > 0, OUTPUT_FALLBACK);

    // 10) 記事カード：深掘り中（選択肢あり）は出さない／それ以外は関連性の高いヒットを最大3枚。
    const cards = suggestions.length ? [] : hitsToCards(relevant, 3);
    const uniqueCount = suggestions.length ? 0 : new Set(relevant.map((h) => h.chunk.url)).size;
    // 「もっと見る」：関連候補が4件以上ある時だけ表示（3件以下はトルツメ）。トップのカテゴリで絞った一覧へ。
    const showMore = uniqueCount > 3;
    const theme = deriveTheme(cards[0]?.category);
    await incrBudget(env, ip); // 成功時のみ月次カウント
    return json({
      kind: 'answer',
      text: guarded.text,
      source: guarded.ok && cards.length ? cards[0].title : undefined,
      sourceHref: guarded.ok && cards.length ? cards[0].href : undefined,
      cards, // 無い時は空＝カードを出さない
      suggestions, // 無い時は空＝追撃チップを出さない
      moreHref: showMore ? '/articles' + (theme ? '?theme=' + encodeURIComponent(theme) : '') : undefined,
      moreLabel: showMore ? 'もっと見る' : undefined,
      flagged: guarded.ok ? undefined : guarded.reasons,
    });
  } catch (e) {
    // AI/ネットワーク不調 → 静的縮退（記事サイトは通常稼働）
    return json(DEGRADED);
  }
};

// ───────── Turnstile ─────────
async function verifyTurnstile(secret: string, token: string | undefined, request: Request): Promise<boolean> {
  if (!secret) return true; // 開発中（未設定）のみ素通り。本番はH-3のフェイルクローズで手前で止まる
  if (!token) return false;
  const form = new FormData();
  form.append('secret', secret);
  form.append('response', token);
  const ip = request.headers.get('cf-connecting-ip');
  if (ip) form.append('remoteip', ip);
  const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form });
  const data = (await r.json()) as { success: boolean };
  return !!data.success;
}

// ───────── 予算カウンタ＋レート制限（KV。厳密上限は Anthropic スペンドリミット。ここは近似・M-4） ─────────
async function checkBudget(env: Env, ip: string): Promise<{ ok: boolean }> {
  if (!env.RATE_KV) return { ok: true }; // 本番では H-3 で手前に到達しない。開発時のみ通す
  const perMin = Number(env.RATE_PER_MIN || '8');
  const monthlyCap = Number(env.MONTHLY_REQUEST_CAP || '300');
  const minKey = `rl:${ip}:${Math.floor(Date.now() / 60000)}`;
  const monKey = `mo:${new Date().toISOString().slice(0, 7)}`;
  const [minRaw, monRaw] = await Promise.all([env.RATE_KV.get(minKey), env.RATE_KV.get(monKey)]);
  if (Number(minRaw || '0') >= perMin) return { ok: false };
  if (Number(monRaw || '0') >= monthlyCap) return { ok: false };
  await env.RATE_KV.put(minKey, String(Number(minRaw || '0') + 1), { expirationTtl: 120 });
  return { ok: true };
}
async function incrBudget(env: Env, _ip: string): Promise<void> {
  if (!env.RATE_KV) return;
  const monKey = `mo:${new Date().toISOString().slice(0, 7)}`;
  const cur = Number((await env.RATE_KV.get(monKey)) || '0');
  await env.RATE_KV.put(monKey, String(cur + 1), { expirationTtl: 60 * 60 * 24 * 40 });
}

// ───────── 埋め込み（Workers AI・無料枠。既定は多言語モデル bge-m3＝日本語対応・H-1） ─────────
async function embed(env: Env, text: string): Promise<number[]> {
  const model = env.EMBED_MODEL || '@cf/baai/bge-m3';
  const out = await env.AI.run(model, { text: [text] });
  // Workers AI の埋め込みは { shape, data: [[...]] } 形式。モデルにより差があるためデプロイ時に実レスポンスで確認（L-2）。
  const vec = out?.data?.[0];
  if (!Array.isArray(vec)) throw new Error('embed_failed');
  return vec as number[];
}

// ───────── Claude 呼び出し（Messages API・プロンプトキャッシュ） ─────────
async function callClaude(env: Env, userText: string, hits: ReturnType<typeof searchChunks>, finalTurn = false): Promise<string> {
  const model = env.MODEL_ANSWER || 'claude-sonnet-5';
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 400, // 出力上限でコストを抑える
      system: [{ type: 'text', text: SYSTEM_GUARDS, cache_control: { type: 'ephemeral' } }], // system固定部をキャッシュ
      messages: [{ role: 'user', content: buildUserContent(userText, hits, finalTurn) }],
    }),
  });
  if (!res.ok) throw new Error('claude_' + res.status);
  const data = (await res.json()) as { content?: { type: string; text?: string }[] };
  return (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
}
