const { najdi, zacatek } = require('../lib/terminy');
const { MISTO_SRAZU } = require('../lib/config');

// Událost do kalendáře (.ics) pro vybraný termín.
function utc(d) {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}
function txt(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

module.exports = (req, res) => {
  const url = new URL(req.url, 'http://x');
  const t = najdi(url.searchParams.get('termin'));
  if (!t) { res.statusCode = 404; return res.end('Termín nenalezen'); }
  const od = zacatek(t);
  const do_ = new Date(od.getTime() + 30 * 60000);
  const ics = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Ctvrt Pod Hady//Vanoce Pod Hady//CS', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${t.id}-20261202@vanoce-pod-hady`,
    `DTSTAMP:${utc(new Date())}`,
    `DTSTART:${utc(od)}`,
    `DTEND:${utc(do_)}`,
    `SUMMARY:${txt(`Vánoce Pod Hády: ${t.nazev}`)}`,
    `LOCATION:${txt('Náměstí Čtvrti Pod Hády, Brno-Maloměřice')}`,
    `DESCRIPTION:${txt(`Sraz je 5 minut předem ${MISTO_SRAZU}. Dotazy: hady@trikaya.cz`)}`,
    'BEGIN:VALARM', 'TRIGGER:-PT2H', 'ACTION:DISPLAY', `DESCRIPTION:${txt(`Vánoce Pod Hády: ${t.nazev} v ${t.cas}`)}`, 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR', '',
  ].join('\r\n');
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="vanoce-pod-hady-${t.cas.replace(':', '')}.ics"`);
  res.end(ics);
};
