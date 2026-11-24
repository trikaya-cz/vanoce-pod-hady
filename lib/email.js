const { DATUM_TEXT, DATUM_KDY, MISTO_SRAZU, KONTAKT, LOGO_BILE, NOVINKY_LIST_ID } = require('./config');

const NAVY = '#152646';
const YELLOW = '#FDCA33';
const INK = '#3A4356';
const FONT = 'Arial, Helvetica, sans-serif';

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const FROM_EMAIL = process.env.MAIL_FROM_EMAIL || 'hady@trikaya.cz';
const FROM_NAME = process.env.MAIL_FROM_NAME || 'Čtvrť Pod Hády';

// Hlavní cesta: transakční e-maily přes Ecomail Trikaya (odesílá z ověřené domény trikaya.cz).
async function posliEcomail({ to, subject, html, text }) {
  const r = await fetch('https://api2.ecomailapp.cz/transactional/send-message', {
    method: 'POST',
    headers: { key: process.env.ECOMAIL_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: {
        subject,
        from_name: FROM_NAME,
        from_email: FROM_EMAIL,
        reply_to: KONTAKT,
        html,
        text,
        to: [{ email: to }],
        options: { click_tracking: false, open_tracking: false },
      },
    }),
  });
  const body = await r.text();
  let d = {};
  try { d = JSON.parse(body); } catch { /* ignore */ }
  if (!r.ok || !(d.results && d.results.total_accepted_recipients >= 1)) {
    console.error('Ecomail neodeslal e-mail', r.status, body.slice(0, 500));
    return { ok: false };
  }
  return { ok: true };
}

// Záložní cesta: SMTP (např. Google Workspace s heslem aplikace).
let transport;
async function posliSmtp({ to, subject, html, text }) {
  if (!transport) {
    const nodemailer = require('nodemailer');
    const port = Number(process.env.SMTP_PORT || 465);
    transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port,
      secure: port === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  }
  await transport.sendMail({ from: `"${FROM_NAME}" <${process.env.MAIL_FROM_EMAIL || process.env.SMTP_USER}>`, to, replyTo: KONTAKT, subject, html, text });
  return { ok: true };
}

async function posli(zprava) {
  try {
    if (process.env.ECOMAIL_API_KEY) return await posliEcomail(zprava);
    if (process.env.SMTP_USER && process.env.SMTP_PASS) return await posliSmtp(zprava);
  } catch (e) {
    console.error('E-mail se neodeslal', e && e.message);
    return { ok: false };
  }
  console.log(`[e-mail neodeslán, chybí ECOMAIL_API_KEY] komu: ${zprava.to} | ${zprava.subject}\n${zprava.text}`);
  if (process.env.MAIL_DUMP_DIR) {
    const fs = require('fs');
    fs.writeFileSync(`${process.env.MAIL_DUMP_DIR}/${Date.now()}-${zprava.to.replace(/[^a-z0-9]/gi, '_')}.html`, zprava.html);
  }
  return { ok: false, skipped: true };
}

function obal(obsah, siteUrl) {
  return `<!doctype html><html lang="cs"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F2F1EC;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#F2F1EC;"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;background:#FFFFFF;border-radius:14px;overflow:hidden;">
<tr><td style="background:${NAVY};padding:22px 36px;">
  <img src="${LOGO_BILE}" height="40" alt="Čtvrť Pod Hády" style="display:block;height:40px;width:auto;max-width:240px;border:0;color:#FFFFFF;font-family:${FONT};font-size:16px;font-weight:bold;">
</td></tr>
${siteUrl ? `<tr><td style="padding:0;background:${NAVY};"><img src="${siteUrl}/img/email.jpg" width="600" alt="Vánoce Pod Hády" style="display:block;width:100%;max-width:600px;height:auto;border:0;"></td></tr>` : ''}
<tr><td style="padding:32px 36px 8px 36px;font-family:${FONT};font-size:16px;line-height:25px;color:${INK};">
${obsah}
</td></tr>
<tr><td style="padding:20px 36px 30px 36px;font-family:${FONT};font-size:13px;line-height:20px;color:#6A7285;border-top:1px solid #E6E3DA;">
Máte dotaz? Napište nám na <a href="mailto:${KONTAKT}" style="color:${NAVY};">${KONTAKT}</a>.<br>
Čtvrť Pod Hády · <a href="https://www.hady.cz" style="color:${NAVY};">www.hady.cz</a>
</td></tr>
</table></td></tr></table></body></html>`;
}

function radek(label, hodnota) {
  return `<tr><td style="padding:6px 16px 6px 0;font-family:${FONT};font-size:14px;color:#6A7285;white-space:nowrap;vertical-align:top;">${label}</td>
<td style="padding:6px 0;font-family:${FONT};font-size:15px;font-weight:bold;color:${NAVY};">${hodnota}</td></tr>`;
}

function potvrzeni({ jmeno, termin, co, zrusitUrl, siteUrl }) {
  const subject = 'Vaše místo na Vánocích Pod Hády je rezervované';
  const html = obal(`
<p style="margin:0 0 16px 0;">Dobrý den,</p>
<p style="margin:0 0 20px 0;">rezervovali jste si ${esc(co)} ${DATUM_TEXT} v ${termin.cas}. Sraz je 5 minut předem ${MISTO_SRAZU}.</p>
<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#FFF8E1;border-left:4px solid ${YELLOW};border-radius:8px;margin:0 0 22px 0;">
<tr><td style="padding:14px 18px;"><table role="presentation" cellspacing="0" cellpadding="0" border="0">
${radek('Co', esc(termin.nazev))}
${radek('Kdy', `${DATUM_KDY}, ${termin.cas}`)}
${radek('Sraz', `5 minut předem ${MISTO_SRAZU}`)}
${radek('Na jméno', esc(jmeno))}
</table></td></tr></table>
<p style="margin:0 0 18px 0;"><a href="${siteUrl}/api/kalendar?termin=${termin.id}" style="color:${NAVY};font-weight:bold;">Uložit termín do kalendáře</a></p>
<p style="margin:0 0 18px 0;">Pokud nemůžete přijít, zrušte prosím rezervaci, ať místo může využít někdo jiný.</p>
<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 24px 0;"><tr><td style="border-radius:999px;border:2px solid ${NAVY};">
<a href="${zrusitUrl}" style="display:inline-block;padding:11px 24px;font-family:${FONT};font-size:14px;font-weight:bold;color:${NAVY};text-decoration:none;">Zrušit rezervaci</a>
</td></tr></table>
<p style="margin:0 0 24px 0;">Těšíme se na vás!</p>`, siteUrl);
  const text = `Dobrý den,\n\nrezervovali jste si ${co} ${DATUM_TEXT} v ${termin.cas}. Sraz je 5 minut předem ${MISTO_SRAZU}.\nNa jméno: ${jmeno}\n\nPokud nemůžete přijít, zrušte prosím rezervaci, ať místo může využít někdo jiný:\n${zrusitUrl}\n\nTěšíme se na vás!\n\nDotazy: ${KONTAKT}`;
  return { subject, html, text };
}

function pripominka({ jmeno, termin, co, zrusitUrl, siteUrl }) {
  const subject = `Zítra se vidíme na Vánocích Pod Hády (${termin.cas})`;
  const obleceni = termin.typ === 'prochazka' ? ' Procházka je venku, tak se oblečte do zimy.' : '';
  const html = obal(`
<p style="margin:0 0 16px 0;">Dobrý den,</p>
<p style="margin:0 0 20px 0;">připomínáme, že máte zítra ve středu 2. 12. v ${termin.cas} rezervovanou ${esc(co)}. Sraz je 5 minut předem ${MISTO_SRAZU}.${obleceni}</p>
<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#FFF8E1;border-left:4px solid ${YELLOW};border-radius:8px;margin:0 0 22px 0;">
<tr><td style="padding:14px 18px;"><table role="presentation" cellspacing="0" cellpadding="0" border="0">
${radek('Co', esc(termin.nazev))}
${radek('Kdy', `${DATUM_KDY}, ${termin.cas}`)}
${radek('Sraz', `5 minut předem ${MISTO_SRAZU}`)}
${radek('Na jméno', esc(jmeno))}
</table></td></tr></table>
<p style="margin:0 0 18px 0;">Od 17:00 bude na náměstí vánoční program. Společně nazdobíme strom, tak si přineste ozdobu z domova.</p>
<p style="margin:0 0 18px 0;">Pokud nemůžete přijít, zrušte prosím rezervaci, ať místo může využít někdo jiný.</p>
<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 24px 0;"><tr><td style="border-radius:999px;border:2px solid ${NAVY};">
<a href="${zrusitUrl}" style="display:inline-block;padding:11px 24px;font-family:${FONT};font-size:14px;font-weight:bold;color:${NAVY};text-decoration:none;">Zrušit rezervaci</a>
</td></tr></table>
<p style="margin:0 0 24px 0;">Těšíme se na vás!</p>`, siteUrl);
  const text = `Dobrý den,\n\npřipomínáme, že máte zítra ve středu 2. 12. v ${termin.cas} rezervovanou ${co}. Sraz je 5 minut předem ${MISTO_SRAZU}.${obleceni}\nNa jméno: ${jmeno}\n\nOd 17:00 bude na náměstí vánoční program. Společně nazdobíme strom, tak si přineste ozdobu z domova.\n\nPokud nemůžete přijít, zrušte prosím rezervaci:\n${zrusitUrl}\n\nTěšíme se na vás!\n\nDotazy: ${KONTAKT}`;
  return { subject, html, text };
}

function kod({ kod }) {
  const subject = `Přihlašovací kód: ${kod}`;
  const html = obal(`
<p style="margin:0 0 16px 0;">Váš kód pro přihlášení do seznamu rezervací:</p>
<p style="margin:0 0 20px 0;font-size:34px;letter-spacing:8px;font-weight:bold;color:${NAVY};">${kod}</p>
<p style="margin:0 0 24px 0;">Kód platí 10 minut. Pokud jste se nepřihlašovali, e-mail ignorujte.</p>`);
  const text = `Váš kód pro přihlášení do seznamu rezervací: ${kod}\nKód platí 10 minut.`;
  return { subject, html, text };
}

// Přidá člověka do seznamu novinek v Ecomailu. Existující kontakty nemění
// (nepřepíše jim štítky ani je znovu nepřihlásí, pokud se dřív odhlásili).
async function prihlasNovinky({ jmeno, email, telefon }) {
  if (!process.env.ECOMAIL_API_KEY) return { ok: false, skipped: true };
  const [name, ...rest] = String(jmeno).split(' ');
  try {
    const r = await fetch(`https://api2.ecomailapp.cz/lists/${NOVINKY_LIST_ID}/subscribe`, {
      method: 'POST',
      headers: { key: process.env.ECOMAIL_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subscriber_data: {
          email, name, surname: rest.join(' '), phone: telefon,
          source: 'Vánoce Pod Hády – rezervace', tags: ['vanoce-pod-hady-2026'],
        },
        trigger_autoresponders: false,
        update_existing: false,
        skip_confirmation: true,
        resubscribe: false,
      }),
    });
    if (!r.ok) { console.error('Ecomail: přidání do seznamu selhalo', r.status, (await r.text()).slice(0, 300)); return { ok: false }; }
    return { ok: true };
  } catch (e) {
    console.error('Ecomail: přidání do seznamu selhalo', e && e.message);
    return { ok: false };
  }
}

function zapnuto() {
  return !!(process.env.ECOMAIL_API_KEY || (process.env.SMTP_USER && process.env.SMTP_PASS));
}

module.exports = { posli, potvrzeni, pripominka, kod, zapnuto, prihlasNovinky };
