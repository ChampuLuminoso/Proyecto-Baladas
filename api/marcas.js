// /api/marcas · Canciones reportadas («🚩 Reportar»), compartidas entre todos los equipos.
//
// Es una función de Vercel (corre en el servidor, no en el navegador).
// Guarda las marcas en una base Redis de Upstash, que se conecta desde Vercel:
//   Storage → Upstash (Redis) → Connect. Vercel crea solo KV_REST_API_URL y KV_REST_API_TOKEN.
// Para borrar marcas (cuando Jorge ya arregló la canción) se pide la clave EDITOR_CLAVE,
// que se guarda en Vercel → Settings → Environment Variables. Esa clave NUNCA llega al navegador.
//
//   GET    /api/marcas            → lista de canciones reportadas
//   POST   /api/marcas            → reportar { id, motivo, nota?, yt?, titulo?, artista? }
//   DELETE /api/marcas?id=c123    → quitar la marca (cabecera x-editor-clave)

const URL_BASE = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const CLAVE = process.env.EDITOR_CLAVE;
const LLAVE = 'djjm:marcas';
const MAXIMO = 1000; // tope de canciones marcadas, por si alguien abusa

const MOTIVOS = ['otra-cancion', 'video-equivocado', 'no-suena', 'mala-calidad', 'otro', 'bloqueada'];

async function redis(...comando) {
  const r = await fetch(URL_BASE, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(comando),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(j.error || `Redis respondió ${r.status}`);
  return j.result;
}

const responder = (datos, estado = 200) => Response.json(datos, {
  status: estado,
  headers: { 'Cache-Control': 'no-store' },
});

const texto = (v, max) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);

export default {
  async fetch(request) {
    if (!URL_BASE || !TOKEN) return responder({ error: 'sin-base', mensaje: 'Falta conectar la base de datos en Vercel.' }, 503);

    try {
      if (request.method === 'GET') {
        const plano = (await redis('HGETALL', LLAVE)) || [];
        const marcas = [];
        for (let i = 0; i < plano.length; i += 2) {
          try { marcas.push(JSON.parse(plano[i + 1])); } catch { /* registro dañado: se ignora */ }
        }
        marcas.sort((a, b) => (b.ultima || '').localeCompare(a.ultima || ''));
        return responder({ marcas });
      }

      if (request.method === 'POST') {
        const b = await request.json().catch(() => null);
        if (!b || !/^c\d{3,4}$/.test(b.id || '') || !MOTIVOS.includes(b.motivo)) {
          return responder({ error: 'datos', mensaje: 'Faltan datos de la canción o el motivo.' }, 400);
        }
        const previa = JSON.parse((await redis('HGET', LLAVE, b.id)) || 'null');
        if (!previa && (await redis('HLEN', LLAVE)) >= MAXIMO) {
          return responder({ error: 'lleno', mensaje: 'Hay demasiadas canciones marcadas. Revise las que ya están.' }, 429);
        }
        const ahora = new Date().toISOString();
        const m = previa || { id: b.id, veces: 0, motivos: {}, notas: [], primera: ahora };
        m.titulo = texto(b.titulo, 150) || m.titulo || '';
        m.artista = texto(b.artista, 150) || m.artista || '';
        if (/^[\w-]{11}$/.test(b.yt || '')) m.yt = b.yt;
        m.veces += 1;
        m.motivos[b.motivo] = (m.motivos[b.motivo] || 0) + 1;
        const nota = texto(b.nota, 300);
        if (nota) m.notas = [...m.notas, { nota, fecha: ahora }].slice(-5);
        m.ultima = ahora;
        await redis('HSET', LLAVE, b.id, JSON.stringify(m));
        return responder({ ok: true, marca: m });
      }

      if (request.method === 'DELETE') {
        if (!CLAVE) return responder({ error: 'sin-clave', mensaje: 'Falta crear EDITOR_CLAVE en Vercel.' }, 403);
        if (request.headers.get('x-editor-clave') !== CLAVE) {
          return responder({ error: 'clave', mensaje: 'La clave del editor no es correcta.' }, 401);
        }
        const id = new URL(request.url).searchParams.get('id') || '';
        if (!/^c\d{3,4}$/.test(id)) return responder({ error: 'datos', mensaje: 'Falta la canción.' }, 400);
        await redis('HDEL', LLAVE, id);
        return responder({ ok: true });
      }

      return responder({ error: 'metodo' }, 405);
    } catch (e) {
      console.error('marcas:', e);
      return responder({ error: 'base', mensaje: 'La base de datos no respondió. Intente más tarde.' }, 502);
    }
  },
};
