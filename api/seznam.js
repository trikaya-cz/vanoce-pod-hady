const { db } = require('../lib/db');
const { obsazenost, najdi } = require('../lib/terminy');
const { json, body, fail } = require('../lib/http');
const auth = require('../lib/auth');

function csvBunka(v) {
  const s = v == null ? '' : String(v);
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

module.exports = async (req, res) => {
  try {
    const admin = auth.prihlaseny(req);
    if (!admin) return json(res, 401, { error: 'Nejste přihlášeni.' });
    const p = await db();

    if (req.method === 'GET') {
      const { rows } = await p.query(
        `select id, termin, jmeno, email, telefon, novinky, prisel, vytvoreno, zruseno, zrusil
         from rezervace order by termin, vytvoreno`);
      const url = new URL(req.url, 'http://x');
      if (url.searchParams.get('format') === 'csv') {
        const hlavicka = ['Termín', 'Čas', 'Jméno', 'E-mail', 'Telefon', 'Souhlas s novinkami', 'Přišel/a', 'Vytvořeno', 'Zrušeno'];
        const radky = rows.map((r) => {
          const t = najdi(r.termin) || { nazev: r.termin, cas: '' };
          return [t.nazev, t.cas, r.jmeno, r.email, r.telefon, r.novinky ? 'ano' : '', r.prisel ? 'ano' : '',
            new Date(r.vytvoreno).toLocaleString('cs-CZ', { timeZone: 'Europe/Prague' }),
            r.zruseno ? new Date(r.zruseno).toLocaleString('cs-CZ', { timeZone: 'Europe/Prague' }) : ''].map(csvBunka).join(';');
        });
        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="rezervace-vanoce-pod-hady.csv"');
        res.setHeader('Cache-Control', 'no-store');
        return res.end('\uFEFF' + [hlavicka.join(';'), ...radky].join('\r\n'));
      }
      return json(res, 200, { admin, terminy: await obsazenost(p), rezervace: rows });
    }

    const b = await body(req);
    const id = parseInt(b.id, 10);
    if (req.method === 'PATCH') {
      await p.query('update rezervace set prisel = $2 where id = $1', [id, !!b.prisel]);
      return json(res, 200, { ok: true });
    }
    if (req.method === 'DELETE') {
      await p.query('update rezervace set zruseno = now(), zrusil = $2 where id = $1 and zruseno is null', [id, admin]);
      return json(res, 200, { ok: true });
    }
    json(res, 405, { error: 'Nepodporovaná metoda.' });
  } catch (e) { fail(res, e); }
};
