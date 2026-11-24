const crypto = require('crypto');
const { db } = require('../lib/db');
const { najdi, uzavreno, coRezervovano } = require('../lib/terminy');
const { json, body, siteUrl, fail } = require('../lib/http');
const mail = require('../lib/email');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Jedna rezervace = jeden člověk. V jedné rezervaci jde vybrat víc termínů,
// pokud se časově nekryjí a nejde o dvě prohlídky bytů (např. procházka 17:15 + byty 18:30).
// Na stejný e-mail se může přihlásit víc lidí (rodina), každý pod svým jménem.
module.exports = async (req, res) => {
  if (req.method !== 'POST') return json(res, 405, { error: 'Jen POST.' });
  try {
    const b = await body(req);
    // Past na roboty: skryté pole vyplní jen robot.
    if (b.web) return json(res, 200, { ok: true, terminy: [] });

    const ids = Array.isArray(b.terminy) ? b.terminy : (b.termin ? [b.termin] : []);
    const vybrane = [...new Set(ids.map(String))].map(najdi);
    const jmeno = String(b.jmeno || '').trim().replace(/\s+/g, ' ').slice(0, 120);
    const email = String(b.email || '').trim().toLowerCase().slice(0, 160);
    const telefon = String(b.telefon || '').trim().slice(0, 40);
    const novinky = b.novinky === true;

    if (!vybrane.length || vybrane.some((t) => !t)) return json(res, 400, { error: 'Vyberte prosím termín.', pole: 'termin' });
    for (let i = 0; i < vybrane.length; i++) {
      for (let j = i + 1; j < vybrane.length; j++) {
        if (vybrane[i].cas === vybrane[j].cas) return json(res, 400, { error: `V ${vybrane[i].cas} můžete mít jen jednu rezervaci. Vyberte prosím jiný čas.` });
        if (vybrane[i].typ === vybrane[j].typ) return json(res, 400, { error: 'Prohlídku bytů stačí rezervovat jednou. Vyberte prosím jen jeden čas.' });
      }
    }
    if (jmeno.length < 3) return json(res, 400, { error: 'Vyplňte prosím jméno a příjmení.', pole: 'jmeno' });
    if (!EMAIL_RE.test(email)) return json(res, 400, { error: 'Zkontrolujte prosím e-mail.', pole: 'email' });
    if (telefon.replace(/\D/g, '').length < 9) return json(res, 400, { error: 'Zkontrolujte prosím telefon.', pole: 'telefon' });
    if (!b.souhlas) return json(res, 400, { error: 'Pro rezervaci potřebujeme váš souhlas se zpracováním údajů.', pole: 'souhlas' });
    const zavreny = vybrane.find((t) => uzavreno(t));
    if (zavreny) return json(res, 409, { error: `Online rezervace na ${zavreny.cas} (${zavreny.nazev}) už je uzavřená.` });

    const p = await db();
    const client = await p.connect();
    const ulozene = [];
    try {
      await client.query('begin');
      await client.query('select pg_advisory_xact_lock(202612021)');
      const { rows: moje } = await client.query(
        'select termin from rezervace where lower(email) = $1 and lower(jmeno) = lower($2) and zruseno is null', [email, jmeno]);
      const mojeTerminy = moje.map((r) => najdi(r.termin)).filter(Boolean);
      for (const t of vybrane) {
        let chyba = null;
        if (mojeTerminy.some((x) => x.id === t.id)) chyba = `${jmeno} už má rezervaci na ${t.cas} (${t.nazev}). Potvrzení najdete v e-mailu.`;
        else if (mojeTerminy.some((x) => x.cas === t.cas)) chyba = `${jmeno} už má v ${t.cas} jinou rezervaci. Vyberte prosím jiný čas.`;
        else if (mojeTerminy.some((x) => x.typ === t.typ)) chyba = `${jmeno} už má rezervovanou ${coRezervovano(t)}.`;
        if (!chyba) {
          const { rows: [{ obsazeno }] } = await client.query(
            'select count(*)::int as obsazeno from rezervace where termin = $1 and zruseno is null', [t.id]);
          if (obsazeno >= t.kapacita) {
            chyba = vybrane.length > 1
              ? `Termín ${t.cas} (${t.nazev}) je už obsazený. Zrušte ho prosím ve výběru, druhý termín pak zarezervujete.`
              : 'Tento termín je už obsazený. Zkuste jiný čas nebo přijďte jen na vánoční program, ten je pro všechny bez rezervace.';
          }
        }
        if (chyba) {
          await client.query('rollback');
          return json(res, 409, { error: chyba });
        }
      }
      for (const t of vybrane) {
        const token = crypto.randomBytes(18).toString('base64url');
        await client.query(
          'insert into rezervace (termin, jmeno, email, telefon, osob, token, novinky) values ($1,$2,$3,$4,1,$5,$6)',
          [t.id, jmeno, email, telefon, token, novinky]);
        ulozene.push({ termin: t, token });
      }
      await client.query('commit');
    } catch (e) {
      await client.query('rollback').catch(() => {});
      throw e;
    } finally {
      client.release();
    }

    ulozene.sort((a, c) => a.termin.cas.localeCompare(c.termin.cas));
    const base = siteUrl(req);
    const m = mail.potvrzeni({
      jmeno,
      polozky: ulozene.map(({ termin, token }) => ({ termin, co: coRezervovano(termin), zrusitUrl: `${base}/zrusit?t=${token}` })),
      kalendarUrl: `${base}/api/kalendar?termin=${ulozene.map((u) => u.termin.id).join(',')}`,
      siteUrl: base,
    });
    const [odeslano] = await Promise.all([
      mail.posli({ to: email, ...m }),
      novinky ? mail.prihlasNovinky({ jmeno, email, telefon }) : null,
    ]);
    // email: true = odesláno, 'vypnuto' = e-maily nejsou nastavené, false = odeslání selhalo
    json(res, 200, {
      ok: true,
      email: odeslano.ok ? true : (odeslano.skipped ? 'vypnuto' : false),
      terminy: ulozene.map(({ termin: t }) => ({ id: t.id, nazev: t.nazev, cas: t.cas, typ: t.typ })),
    });
  } catch (e) { fail(res, e); }
};
