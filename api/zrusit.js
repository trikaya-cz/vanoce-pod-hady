const { db } = require('../lib/db');
const { najdi } = require('../lib/terminy');
const { json, body, fail } = require('../lib/http');

module.exports = async (req, res) => {
  try {
    const p = await db();
    if (req.method === 'GET') {
      const url = new URL(req.url, 'http://x');
      const token = url.searchParams.get('t') || '';
      const { rows: [r] } = await p.query('select termin, jmeno, zruseno from rezervace where token = $1', [token]);
      if (!r) return json(res, 404, { error: 'Rezervaci jsme nenašli.' });
      const t = najdi(r.termin);
      return json(res, 200, { nazev: t.nazev, cas: t.cas, jmeno: r.jmeno, zruseno: !!r.zruseno });
    }
    if (req.method === 'POST') {
      const { t: token } = await body(req);
      const { rowCount } = await p.query(
        "update rezervace set zruseno = now(), zrusil = 'host' where token = $1 and zruseno is null", [String(token || '')]);
      return json(res, 200, { ok: rowCount === 1 });
    }
    json(res, 405, { error: 'Nepodporovaná metoda.' });
  } catch (e) { fail(res, e); }
};
