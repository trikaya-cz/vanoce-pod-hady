const crypto = require('crypto');
const { db } = require('../lib/db');
const { najdi, uzavreno, coRezervovano } = require('../lib/terminy');
const { json, body, siteUrl, fail } = require('../lib/http');
const mail = require('../lib/email');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Jedna rezervace = jeden člověk. Na stejný e-mail se může přihlásit i víc lidí
// (rodina), ale každý pod svým jménem.
module.exports = async (req, res) => {
  if (req.method !== 'POST') return json(res, 405, { error: 'Jen POST.' });
  try {
    const b = await body(req);
    // Past na roboty: skryté pole vyplní jen robot.
    if (b.web) return json(res, 200, { ok: true });

    const t = najdi(b.termin);
    const jmeno = String(b.jmeno || '').trim().replace(/\s+/g, ' ').slice(0, 120);
    const email = String(b.email || '').trim().toLowerCase().slice(0, 160);
    const telefon = String(b.telefon || '').trim().slice(0, 40);
    const novinky = b.novinky === true;

    if (!t) return json(res, 400, { error: 'Vyberte prosím termín.', pole: 'termin' });
    if (jmeno.length < 3) return json(res, 400, { error: 'Vyplňte prosím jméno a příjmení.', pole: 'jmeno' });
    if (!EMAIL_RE.test(email)) return json(res, 400, { error: 'Zkontrolujte prosím e-mail.', pole: 'email' });
    if (telefon.replace(/\D/g, '').length < 9) return json(res, 400, { error: 'Zkontrolujte prosím telefon.', pole: 'telefon' });
    if (!b.souhlas) return json(res, 400, { error: 'Pro rezervaci potřebujeme váš souhlas se zpracováním údajů.', pole: 'souhlas' });
    if (uzavreno(t)) return json(res, 409, { error: 'Online rezervace na tento termín už je uzavřená.' });

    const p = await db();
    const client = await p.connect();
    let token;
    try {
      await client.query('begin');
      await client.query('select pg_advisory_xact_lock(202612021)');
      const { rows: moje } = await client.query(
        'select termin from rezervace where lower(email) = $1 and lower(jmeno) = lower($2) and zruseno is null', [email, jmeno]);
      if (moje.some((r) => r.termin === t.id)) {
        await client.query('rollback');
        return json(res, 409, { error: `${jmeno} už má na tento termín rezervaci. Potvrzení najdete v e-mailu.` });
      }
      const kolize = moje.map((r) => najdi(r.termin)).find((x) => x && x.cas === t.cas);
      if (kolize) {
        await client.query('rollback');
        return json(res, 409, { error: `${jmeno} už má v ${t.cas} rezervaci: ${kolize.nazev}. Vyberte si prosím jiný čas.` });
      }
      const { rows: [{ obsazeno }] } = await client.query(
        'select count(*)::int as obsazeno from rezervace where termin = $1 and zruseno is null', [t.id]);
      if (obsazeno >= t.kapacita) {
        await client.query('rollback');
        return json(res, 409, { error: 'Tento termín je už obsazený. Zkuste jiný čas nebo přijďte jen na vánoční program, ten je pro všechny bez rezervace.', plno: true });
      }
      token = crypto.randomBytes(18).toString('base64url');
      await client.query(
        'insert into rezervace (termin, jmeno, email, telefon, osob, token, novinky) values ($1,$2,$3,$4,1,$5,$6)',
        [t.id, jmeno, email, telefon, token, novinky]);
      await client.query('commit');
    } catch (e) {
      await client.query('rollback').catch(() => {});
      throw e;
    } finally {
      client.release();
    }

    const base = siteUrl(req);
    const m = mail.potvrzeni({ jmeno, termin: t, co: coRezervovano(t), zrusitUrl: `${base}/zrusit?t=${token}`, siteUrl: base });
    const [odeslano] = await Promise.all([
      mail.posli({ to: email, ...m }),
      novinky ? mail.prihlasNovinky({ jmeno, email, telefon }) : null,
    ]);
    // email: true = odesláno, 'vypnuto' = e-maily nejsou nastavené, false = odeslání selhalo
    json(res, 200, { ok: true, email: odeslano.ok ? true : (odeslano.skipped ? 'vypnuto' : false), termin: { nazev: t.nazev, cas: t.cas, typ: t.typ } });
  } catch (e) { fail(res, e); }
};
