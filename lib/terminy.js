const { TERMINY, DATUM, UZAVRIT_MINUT_PRED } = require('./config');

function zacatek(t) {
  return new Date(`${DATUM}T${t.cas}:00+01:00`);
}

function uzavreno(t, now = new Date()) {
  return now.getTime() >= zacatek(t).getTime() - UZAVRIT_MINUT_PRED * 60000;
}

function najdi(id) {
  return TERMINY.find((t) => t.id === id);
}

// Popis do e-mailu: "prohlídku bytů" / "komentovanou procházku"
function coRezervovano(t) {
  return t.typ === 'byty' ? 'prohlídku bytů' : 'komentovanou procházku Jak vznikala Čtvrť Pod Hády';
}

async function obsazenost(client) {
  const { rows } = await client.query(
    'select termin, count(*)::int as obsazeno from rezervace where zruseno is null group by termin'
  );
  const map = Object.fromEntries(rows.map((r) => [r.termin, r]));
  return TERMINY.map((t) => {
    const obsazeno = map[t.id] ? map[t.id].obsazeno : 0;
    return {
      id: t.id, typ: t.typ, nazev: t.nazev, cas: t.cas, kapacita: t.kapacita,
      obsazeno,
      volno: Math.max(0, t.kapacita - obsazeno),
      uzavreno: uzavreno(t),
    };
  });
}

module.exports = { zacatek, uzavreno, najdi, coRezervovano, obsazenost };
