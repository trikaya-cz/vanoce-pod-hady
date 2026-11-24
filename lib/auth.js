const crypto = require('crypto');

const COOKIE = 'vph_session';

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) throw new Error('Chybí SESSION_SECRET (aspoň 16 znaků).');
  return s;
}

function admini() {
  return (process.env.ADMIN_EMAILS || '')
    .split(/[,;\s]+/).map((e) => e.trim().toLowerCase()).filter(Boolean);
}

function jeAdmin(email) {
  return admini().includes(String(email || '').trim().toLowerCase());
}

function hashKodu(email, kod) {
  return crypto.createHmac('sha256', secret()).update(`${email.toLowerCase()}|${kod}`).digest('hex');
}

function podpis(data) {
  return crypto.createHmac('sha256', secret()).update(data).digest('base64url');
}

function vytvorSession(email, dniPlatnosti = 30) {
  const exp = Date.now() + dniPlatnosti * 86400000;
  const data = Buffer.from(`${email.toLowerCase()}|${exp}`).toString('base64url');
  return `${data}.${podpis(data)}`;
}

function cookieHeader(value, maxAgeSec) {
  return `${COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSec}`;
}

function prectiCookie(req) {
  const raw = req.headers.cookie || '';
  const m = raw.split(/;\s*/).find((c) => c.startsWith(`${COOKIE}=`));
  return m ? m.slice(COOKIE.length + 1) : null;
}

// Vrátí e-mail přihlášeného admina, nebo null.
function prihlaseny(req) {
  const v = prectiCookie(req);
  if (!v || !v.includes('.')) return null;
  const [data, sig] = v.split('.');
  const ok = sig && podpis(data).length === sig.length &&
    crypto.timingSafeEqual(Buffer.from(podpis(data)), Buffer.from(sig));
  if (!ok) return null;
  const [email, exp] = Buffer.from(data, 'base64url').toString('utf8').split('|');
  if (!exp || Date.now() > Number(exp)) return null;
  return jeAdmin(email) ? email : null;
}

// Společné heslo pro tým, když e-maily nejsou nastavené (přihlášení bez kódu).
function hesloSedi(heslo) {
  const spravne = process.env.ADMIN_PASSWORD || '';
  if (spravne.length < 8) return false;
  const a = crypto.createHash('sha256').update(String(heslo || '')).digest();
  const b = crypto.createHash('sha256').update(spravne).digest();
  return crypto.timingSafeEqual(a, b);
}

module.exports = { jeAdmin, hashKodu, vytvorSession, cookieHeader, prihlaseny, hesloSedi };
