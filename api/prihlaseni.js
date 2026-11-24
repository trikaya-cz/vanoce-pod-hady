const crypto = require('crypto');
const { db } = require('../lib/db');
const { json, body, fail } = require('../lib/http');
const auth = require('../lib/auth');
const mail = require('../lib/email');

// Dva režimy přihlášení do seznamu:
//  - 'kod'   když jsou nastavené e-maily: e-mail → kód do schránky
//  - 'heslo' když e-maily nastavené nejsou: e-mail ze seznamu + společné heslo týmu
// GET = kdo je přihlášený a jaký je režim, POST {email} = poslat kód,
// PUT {email, kod} nebo {email, heslo} = přihlásit, DELETE = odhlásit
module.exports = async (req, res) => {
  try {
    const rezim = mail.zapnuto() ? 'kod' : 'heslo';
    if (req.method === 'GET') return json(res, 200, { email: auth.prihlaseny(req), rezim });

    if (req.method === 'DELETE') {
      res.setHeader('Set-Cookie', auth.cookieHeader('', 0));
      return json(res, 200, { ok: true });
    }

    const b = await body(req);
    const email = String(b.email || '').trim().toLowerCase();
    const p = await db();

    if (req.method === 'POST') {
      if (rezim === 'kod' && auth.jeAdmin(email)) {
        const kod = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
        await p.query(
          `insert into prihlasovaci_kody (email, kod_hash, plati_do, pokusy) values ($1, $2, now() + interval '10 minutes', 0)
           on conflict (email) do update set kod_hash = excluded.kod_hash, plati_do = excluded.plati_do, pokusy = 0`,
          [email, auth.hashKodu(email, kod)]);
        await mail.posli({ to: email, ...mail.kod({ kod }) });
      }
      // Stejná odpověď pro všechny, ať nejde zjistit, kdo má přístup.
      return json(res, 200, { ok: true });
    }

    if (req.method === 'PUT' && rezim === 'heslo') {
      // Ochrana proti zkoušení hesel: po 10 chybách 15 minut pauza.
      const { rows: [z] } = await p.query('select pokusy, plati_do from prihlasovaci_kody where email = $1', [`heslo:${email}`]);
      if (z && z.pokusy >= 10 && new Date(z.plati_do) > new Date()) {
        return json(res, 429, { error: 'Příliš mnoho pokusů. Zkuste to prosím za 15 minut.' });
      }
      if (!auth.jeAdmin(email) || !auth.hesloSedi(b.heslo)) {
        await p.query(
          `insert into prihlasovaci_kody (email, kod_hash, plati_do, pokusy) values ($1, '-', now() + interval '15 minutes', 1)
           on conflict (email) do update set pokusy = case when prihlasovaci_kody.plati_do < now() then 1 else prihlasovaci_kody.pokusy + 1 end,
           plati_do = now() + interval '15 minutes'`, [`heslo:${email}`]);
        return json(res, 401, { error: 'E-mail nebo heslo nesedí.' });
      }
      await p.query('delete from prihlasovaci_kody where email = $1', [`heslo:${email}`]);
      res.setHeader('Set-Cookie', auth.cookieHeader(auth.vytvorSession(email), 30 * 86400));
      return json(res, 200, { ok: true, email });
    }

    if (req.method === 'PUT') {
      const kod = String(b.kod || '').replace(/\D/g, '');
      const { rows: [r] } = await p.query('select kod_hash, plati_do, pokusy from prihlasovaci_kody where email = $1', [email]);
      if (!r || new Date(r.plati_do) < new Date() || r.pokusy >= 5) {
        return json(res, 401, { error: 'Kód vypršel. Pošlete si prosím nový.' });
      }
      if (r.kod_hash !== auth.hashKodu(email, kod)) {
        await p.query('update prihlasovaci_kody set pokusy = pokusy + 1 where email = $1', [email]);
        return json(res, 401, { error: 'Kód nesedí. Zkontrolujte ho prosím.' });
      }
      await p.query('delete from prihlasovaci_kody where email = $1', [email]);
      res.setHeader('Set-Cookie', auth.cookieHeader(auth.vytvorSession(email), 30 * 86400));
      return json(res, 200, { ok: true, email });
    }

    json(res, 405, { error: 'Nepodporovaná metoda.' });
  } catch (e) { fail(res, e); }
};
