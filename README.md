# Vánoce Pod Hády – rezervace prohlídek

Landing page s rezervacemi na prohlídky bytů (17:15 a 18:30, 30 míst) a komentovanou procházku (17:15, 50 míst) na akci 2. 12. 2026.

## Co v projektu je

| Adresa | K čemu |
| --- | --- |
| `/` | Landing page s rezervačním formulářem a živým počtem volných míst |
| `/seznam` | Seznam rezervací pro tým: přihlášení kódem z e-mailu, odškrtávání příchodů, rušení, export do Excelu |
| `/zrusit?t=…` | Zrušení rezervace z odkazu v potvrzovacím e-mailu |
| `/api/kalendar?termin=…` | Událost do kalendáře (.ics) pro vybraný termín |
| `/api/pripominka` | Připomínka den před akcí. Spouští ji Vercel Cron 1. 12. v 9:00, každý ji dostane jen jednou |

Jedna rezervace = jeden člověk. V jedné rezervaci jde vybrat víc termínů, pokud se časově nekryjí a nejde o dvě prohlídky bytů (typicky procházka 17:15 + byty 18:30); v databázi je pak každý termín jako samostatný řádek a připomínka přijde jedna společná. Na stejný e-mail se může přihlásit víc lidí (třeba rodina), ale každý pod svým jménem. Stejný člověk nemůže mít dvě rezervace ve stejný čas (procházka a byty v 17:15). Online rezervace termínu se uzavře v čase jeho začátku.

## Služby

- **GitHub** (firemní účet Trikaya): kód
- **Vercel** (firemní účet Trikaya): web a serverové funkce v `api/`
- **Neon Postgres** (přidaný ve Vercelu přes Storage): databáze rezervací, tabulky se vytvoří samy při prvním spuštění
- **Ecomail Trikaya**: potvrzovací e-maily a přihlašovací kódy odchází jako transakční e-maily z adresy hady@trikaya.cz

## E-maily jsou volitelné

Bez `ECOMAIL_API_KEY` web funguje taky: rezervace se ukládají, člověk uvidí potvrzení na obrazovce s tlačítkem pro uložení do kalendáře a tým se do seznamu přihlásí e-mailem a společným heslem (`ADMIN_PASSWORD`). Po doplnění klíče se začnou posílat potvrzovací e-maily a přihlášení do seznamu se přepne na kód z e-mailu.

## Proměnné prostředí ve Vercelu

| Název | Hodnota |
| --- | --- |
| `DATABASE_URL` | doplní Vercel sám po připojení databáze Neon |
| `ECOMAIL_API_KEY` | API klíč z Ecomailu (Správa účtu → Integrace) |
| `MAIL_FROM_EMAIL` | nepovinné, výchozí `hady@trikaya.cz` (musí být na doméně ověřené v Ecomailu) |
| `MAIL_FROM_NAME` | nepovinné, výchozí `Čtvrť Pod Hády` |
| `ECOMAIL_LIST_ID` | nepovinné, seznam pro souhlas s novinkami, výchozí `108` |
| `SMTP_USER`, `SMTP_PASS`, `SMTP_HOST`, `SMTP_PORT` | jen záložní cesta přes poštovní server, pokud by Ecomail nešel použít |
| `MAIL_REPLY_TO` | `hady@trikaya.cz` |
| `ADMIN_EMAILS` | e-maily s přístupem k seznamu, oddělené čárkou |
| `CRON_SECRET` | nepovinné, když je nastavené, spustí připomínky jen Vercel Cron nebo přihlášený tým |
| `ADMIN_PASSWORD` | společné heslo týmu do seznamu, používá se, dokud nejsou nastavené e-maily |
| `SESSION_SECRET` | náhodný řetězec, aspoň 32 znaků |

## Úpravy

- Časy, kapacity, místo srazu, adresa loga: `lib/config.js`
- Texty stránky: `index.html`
- Odkaz na zásady ochrany osobních údajů: konstanta `ZASADY_URL` v `index.html` (nastaveno na https://www.hady.cz/cs/ochrana-osobnich-udaju)
- Potvrzovací e-mail: `lib/email.js`
- Obrázky: složka `img/` (úvod na šířku, výřez na výšku pro mobil, náhled pro sdílení `og.jpg`, hlavička e-mailu `email.jpg`)
- Po zprovoznění domény přepsat v `index.html` adresu `og:image` na celou adresu, např. `https://vanoce.hady.cz/img/og.jpg`
