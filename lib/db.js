const { Pool } = require('pg');

const SCHEMA = `
create table if not exists rezervace (
  id bigserial primary key,
  termin text not null,
  jmeno text not null,
  email text not null,
  telefon text not null,
  osob int not null default 1,
  token text not null unique,
  prisel boolean not null default false,
  vytvoreno timestamptz not null default now(),
  zruseno timestamptz,
  zrusil text
);
alter table rezervace add column if not exists pripomenuto timestamptz;
alter table rezervace add column if not exists novinky boolean not null default false;
create index if not exists rezervace_termin_idx on rezervace (termin) where zruseno is null;
create index if not exists rezervace_email_idx on rezervace (lower(email)) where zruseno is null;
create table if not exists prihlasovaci_kody (
  email text primary key,
  kod_hash text not null,
  plati_do timestamptz not null,
  pokusy int not null default 0
);
`;

let pool;
let ready;

function getPool() {
  if (!pool) {
    const cs = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    if (!cs) throw new Error('Chybí DATABASE_URL (napojení databáze ve Vercelu).');
    const local = /localhost|127\.0\.0\.1/.test(cs);
    pool = new Pool({ connectionString: cs, max: 3, ssl: local ? false : { rejectUnauthorized: false } });
  }
  return pool;
}

async function db() {
  const p = getPool();
  if (!ready) ready = p.query(SCHEMA).catch((e) => { ready = null; throw e; });
  await ready;
  return p;
}

module.exports = { db };
