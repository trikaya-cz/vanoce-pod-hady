const { db } = require('../lib/db');
const { najdi, coRezervovano } = require('../lib/terminy');
const { json, siteUrl, fail } = require('../lib/http');
const auth = require('../lib/auth');
const mail = require('../lib/email');

// Připomínka den před akcí. Spouští ji Vercel Cron 1. 12. ráno (viz vercel.json).
// Každý dostane připomínku jen jednou, takže opakované spuštění nevadí.
const OD = new Date('2026-12-01T08:00:00+01:00');
const DO = new Date('2026-12-02T12:00:00+01:00');

module.exports = async (req, res) => {
  try {
    const now = new Date();
    if (now < OD) return json(res, 200, { ok: true, odeslano: 0, zprava: 'Na připomínky je ještě brzy, odejdou 1. 12. ráno.' });
    if (now > DO) return json(res, 200, { ok: true, odeslano: 0, zprava: 'Akce už začala, připomínky se neposílají.' });
    // Když je nastavený CRON_SECRET, smí připomínky spustit jen Vercel Cron nebo přihlášený tým.
    if (process.env.CRON_SECRET && req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}` && !auth.prihlaseny(req)) {
      return json(res, 401, { error: 'Nepovoleno.' });
    }
    if (!mail.zapnuto()) return json(res, 200, { ok: false, zprava: 'E-maily nejsou nastavené.' });

    const p = await db();
    const { rows } = await p.query(
      'select id, termin, jmeno, email, token from rezervace where zruseno is null and pripomenuto is null order by id limit 400');
    const base = siteUrl(req);
    let odeslano = 0, chyby = 0;
    const fronta = [...rows];
    async function pracovnik() {
      while (fronta.length) {
        const r = fronta.shift();
        const t = najdi(r.termin);
        if (!t) continue;
        const m = mail.pripominka({ jmeno: r.jmeno, termin: t, co: coRezervovano(t), zrusitUrl: `${base}/zrusit?t=${r.token}`, siteUrl: base });
        const v = await mail.posli({ to: r.email, ...m });
        if (v.ok) {
          odeslano++;
          await p.query('update rezervace set pripomenuto = now() where id = $1', [r.id]);
        } else chyby++;
      }
    }
    await Promise.all([pracovnik(), pracovnik(), pracovnik(), pracovnik()]);
    json(res, 200, { ok: true, odeslano, chyby, celkem: rows.length });
  } catch (e) { fail(res, e); }
};

module.exports.config = { maxDuration: 60 };
