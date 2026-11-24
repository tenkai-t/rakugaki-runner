// Rakugaki Runner - online ranking API (Cloudflare Worker + D1)
// Routes:
//   GET  /                              -> "ok"
//   GET  /ranking?mode=0&uuid=<uuid>    -> { top: [...10], total, myRank, myBest }
//   POST /scores { uuid, name, score, mode } -> ベスト更新時のみ上書きし { ok, updated, rank, name } を返す
// 名前は記録ごとに付く（アルケミーフュージョンと同じ方式）：そのモードのベストを更新したときだけ、名前も新しいものに変わる。ベスト未満の登録では名前もスコアも変わらない
// mode: 0=ノーマル / 1=ハード / 2=インク拾い（ゲーム側の modeIdx と一致）
const ALLOW_ORIGIN = 'https://tenkai-t.github.io';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': ALLOW_ORIGIN,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders() },
  });
}
function validUuid(v) {
  return typeof v === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(v);
}
function cleanName(v) {
  if (typeof v !== 'string') return null;
  const name = v.trim();
  const len = [...name].length;
  if (len < 1 || len > 10) return null;
  return name;
}
const NG_WORDS=['しね','死ね','ころす','殺す','くそ','ばか','あほ','きちがい','ちんこ','ちんちん','ちんぽ','まんこ','おっぱい','せっくす','うんこ','うんち','じさつ','自殺','4545','0721','1919','114514','しこしこ','おなにー','おなに','ぺにす','きんたま','くりとりす','ふぇら','くんに','ぱいずり','てまん','あなる','えろ','えっち','すけべ','へんたい','変態','いんらん','淫乱','ちかん','痴漢','ちじょ','痴女','ろり','ろりこん','しょた','ぺど','れいぷ','ごうかん','強姦','りんかん','輪姦','わいせつ','猥褻','性行為','発情','はつじょう','自慰','ばいしゅん','売春','えんこう','ぱぱかつ','パパ活','ふうぞく','風俗','そーぷ','でりへる','ぴんさろ','あだると','fuck','shit','dick','pussy','bitch','porn','sex','penis','vagina','anal','boobs','tits','hentai','cum','cock','sperm'];
function normalizeName(s){return String(s).replace(/[！-～]/g,c=>String.fromCharCode(c.charCodeAt(0)-0xFEE0)).toLowerCase().replace(/[ァ-ヶ]/g,c=>String.fromCharCode(c.charCodeAt(0)-0x60)).replace(/[\s　・_.\-~〜]/g,'')}
function isNgName(name){const n=normalizeName(name);return NG_WORDS.some(w=>n.includes(normalizeName(w)))}
function validMode(v) {
  return Number.isInteger(v) && v >= 0 && v <= 2;
}
function validScore(v) {
  return Number.isInteger(v) && v >= 1 && v <= 999999;
}
async function rankOf(db, mode, row) {
  const r = await db.prepare(
    'SELECT COUNT(*) AS c FROM scores WHERE mode = ? AND (score > ? OR (score = ? AND created_at < ?) OR (score = ? AND created_at = ? AND id < ?))'
  ).bind(mode, row.score, row.score, row.created_at, row.score, row.created_at, row.id).first();
  return (r ? r.c : 0) + 1;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders() });
    try {
      if (url.pathname === '/' && request.method === 'GET') {
        return new Response('ok', { headers: { 'Content-Type': 'text/plain; charset=utf-8', ...corsHeaders() } });
      }
      if (url.pathname === '/ranking' && request.method === 'GET') {
        const mode = Number(url.searchParams.get('mode'));
        if (!validMode(mode)) return json({ error: 'invalid mode' }, 400);
        const top = await env.DB.prepare(
          'SELECT name, score FROM scores WHERE mode = ? ORDER BY score DESC, created_at ASC, id ASC LIMIT 10'
        ).bind(mode).all();
        const totalRow = await env.DB.prepare('SELECT COUNT(*) AS c FROM scores WHERE mode = ?').bind(mode).first();
        let myRank = null, myBest = null;
        const uuid = url.searchParams.get('uuid');
        if (validUuid(uuid)) {
          const best = await env.DB.prepare(
            'SELECT id, name, score, created_at FROM scores WHERE uuid = ? AND mode = ?'
          ).bind(uuid, mode).first();
          if (best) {
            myBest = { name: best.name, score: best.score };
            myRank = await rankOf(env.DB, mode, best);
          }
        }
        let myName = null;
        if (validUuid(uuid)) {
          const anyRow = await env.DB.prepare(
            'SELECT name FROM scores WHERE uuid = ? ORDER BY id ASC LIMIT 1'
          ).bind(uuid).first();
          if (anyRow) myName = anyRow.name;
        }
        return json({
          top: (top.results || []).map(e => ({ name: e.name, score: e.score })),
          total: totalRow ? totalRow.c : 0,
          myRank, myBest, myName,
        });
      }
      if (url.pathname === '/scores' && request.method === 'POST') {
        let body;
        try { body = await request.json(); } catch (e) { return json({ error: 'invalid json' }, 400); }
        const uuid = body && body.uuid;
        const name = body && cleanName(body.name);
        const score = body && body.score;
        const mode = body && body.mode;
        if (!validUuid(uuid)) return json({ error: 'invalid uuid' }, 400);
        if (name === null) return json({ error: 'invalid name' }, 400);
        if (isNgName(name)) return json({ error: 'name not allowed' }, 400);
        if (!validScore(score)) return json({ error: 'invalid score' }, 400);
        if (!validMode(mode)) return json({ error: 'invalid mode' }, 400);
        const cur = await env.DB.prepare(
          'SELECT id, name, score, created_at, updated_at FROM scores WHERE uuid = ? AND mode = ?'
        ).bind(uuid, mode).first();
        const now = new Date();
        // 送信頻度のつじつまチェック: 同一端末・同一モードの更新から5秒未満の再送信は受け付けない
        if (cur && now - new Date(cur.updated_at) < 5000) return json({ error: 'too fast' }, 429);
        const nowIso = now.toISOString();
        if (!cur) {
          const ins = await env.DB.prepare(
            'INSERT INTO scores (uuid, mode, name, score, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
          ).bind(uuid, mode, name, score, nowIso, nowIso).run();
          const rank = await rankOf(env.DB, mode, { id: ins.meta.last_row_id, score, created_at: nowIso });
          return json({ ok: true, updated: true, rank, name });
        }
        if (score > cur.score) {
          await env.DB.prepare(
            'UPDATE scores SET name = ?, score = ?, created_at = ?, updated_at = ? WHERE id = ?'
          ).bind(name, score, nowIso, nowIso, cur.id).run();
          const rank = await rankOf(env.DB, mode, { id: cur.id, score, created_at: nowIso });
          return json({ ok: true, updated: true, rank, name });
        }
        // ベスト未満: スコアも名前も据え置き（名前はベスト更新時にだけ変わる）
        const rank = await rankOf(env.DB, mode, cur);
        return json({ ok: true, updated: false, rank, name: cur.name });
      }
      return json({ error: 'not found' }, 404);
    } catch (e) {
      return json({ error: 'server error' }, 500);
    }
  },
};
