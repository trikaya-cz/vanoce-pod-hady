// Nastavení akce. Kapacity a časy se mění tady. Jedna rezervace = jeden člověk.
const TERMINY = [
  { id: 'byty-1715', typ: 'byty', nazev: 'Prohlídka bytů', cas: '17:15', kapacita: 30 },
  { id: 'prochazka-1715', typ: 'prochazka', nazev: 'Komentovaná procházka: Jak vznikala Čtvrť Pod Hády', cas: '17:15', kapacita: 50 },
  { id: 'byty-1830', typ: 'byty', nazev: 'Prohlídka bytů', cas: '18:30', kapacita: 30 },
];

module.exports = {
  TERMINY,
  DATUM: '2026-12-02',
  DATUM_TEXT: 've středu 2. 12. 2026',
  DATUM_KDY: 'Středa 2. 12. 2026',
  // Online rezervace termínu se uzavře tolik minut před jeho začátkem.
  UZAVRIT_MINUT_PRED: 0,
  MISTO_SRAZU: 'u showroomu na náměstí Čtvrti Pod Hády',
  KONTAKT: process.env.MAIL_REPLY_TO || 'hady@trikaya.cz',
  // Seznam v Ecomailu pro lidi, kteří zaškrtnou souhlas s novinkami.
  NOVINKY_LIST_ID: Number(process.env.ECOMAIL_LIST_ID || 108),
  LOGO_BILE: 'https://storage.googleapis.com/trikaya39047/logo-hady-bila.png',
};
