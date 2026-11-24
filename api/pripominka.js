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
      'select id, termin, jmeno, email, token from rezervace where zruseno is null and pripomenuto is null order by id limit 600');
    // Kdo má víc termínů (procházka + byty), dostane jednu společnou připomínku.
    const skupiny = new Map();
    for (const r of rows) {
      const t = najdi(r.termin);
      if (!t) continue;
      const k = `${r.email.toLowerCase()}|${r.jmeno.toLowerCase()}`;
      if (!skupiny.has(k)) skupiny.set(k, { email: r.email, jmeno: r.jmeno, polozky: [], ids: [] });
      const g = skupiny.get(k);
      g.polozky.push({ termin: t, co: coRezervovano(t), zrusitUrl: `${siteUrl(req)}/zrusit?t=${r.token}` });
      g.ids.push(r.id);
    }
    const base = siteUrl(req);
    let odeslano = 0, chyby = 0;
    const fronta = [...skupiny.values()];
    async function pracovnik() {
      while (fronta.length) {
        const g = fronta.shift();
        g.polozky.sort((a, b) => a.termin.cas.localeCompare(b.termin.cas));
        const m = mail.pripominka({ jmeno: g.jmeno, polozky: g.polozky, siteUrl: base });
        const v = await mail.posli({ to: g.email, ...m });
        if (v.ok) {
          odeslano++;
          await p.query('update rezervace set pripomenuto = now() where id = any($1::bigint[])', [g.ids]);
        } else chyby++;
      }
    }
    await Promise.all([pracovnik(), pracovnik(), pracovnik(), pracovnik()]);
    json(res, 200, { ok: true, odeslano, chyby, lidi: skupiny.size, rezervaci: rows.length });
  } catch (e) { fail(res, e); }
};

module.exports.config = { maxDuration: 60 };
