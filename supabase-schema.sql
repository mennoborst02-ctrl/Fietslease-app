-- ============================================================
-- FIETSLEASE HOLLAND — Supabase schema
-- Voer dit uit in de Supabase SQL-editor
-- ============================================================


-- ============================================================
-- 1. CONTRACTEN
--    Gevuld via sync.js vanuit MySQL klanten_data
-- ============================================================
create table if not exists contracten (
  id                  integer primary key,
  naam                text,
  email               text,
  telefoon            text,
  klant_sinds         date,

  contractnummer      text,
  maandbedrag         numeric(10,2),
  startdatum          date,
  einddatum           date,
  maanden_verstreken  integer,
  contracttijd        integer,       -- totale looptijd in maanden

  merk                text,
  model               text,          -- echte modelnaam, GEEN contractnummer
  bouwjaar            integer,
  kleur               text,
  framenummer         text,
  batterij_wh         integer,       -- 0 = geen e-bike
  foto_url            text           -- gekoppeld door sync.js via webscrape
);


-- ============================================================
-- 2. FACTUREN
--    Gevuld via sync.js vanuit MySQL facturen-tabel
-- ============================================================
create table if not exists facturen (
  id                  serial primary key,
  contractnummer      text not null,
  email               text not null,  -- voor filtering per ingelogde klant

  periode             text not null,  -- weergavenaam, bijv. "April 2025"
  factuurdatum        date not null,  -- werkelijke datum, bijv. 2025-04-01
  bedrag              numeric(10,2) not null,
  status              text not null   -- 'paid' of 'outstanding'
    check (status in ('paid','outstanding')),
  factuur_url         text            -- optioneel: link naar PDF
);

create index if not exists facturen_email_idx on facturen(email);
create index if not exists facturen_contractnummer_idx on facturen(contractnummer);


-- ============================================================
-- 3. SERVICE_MELDINGEN
--    Deels gevuld via sync.js (historische meldingen vanuit MySQL),
--    nieuwe meldingen binnengekomen via Tally-formulier
-- ============================================================
create table if not exists service_meldingen (
  id                  text primary key,  -- bijv. 's2347'
  contractnummer      text not null,
  email               text not null,     -- voor filtering per ingelogde klant

  categorie           text not null,
  -- mogelijke waarden: 'Lekke band', 'Remmen', 'Batterij / motor',
  -- 'Verlichting', 'Versnelling', 'Slot / sleutel', 'Schade', 'Diefstal', 'Overig'

  omschrijving        text not null,
  status              text not null
    check (status in ('submitted','assigned','in_progress','completed')),
  locatie             text,              -- naam van de servicepartner
  aanmaakdatum        date not null,
  tijdlijn            jsonb not null
  -- formaat: [
  --   {"stap": "Ingediend",      "tijd": "5 apr, 14:00", "ok": true},
  --   {"stap": "Toegewezen",     "tijd": "5 apr, 16:45", "ok": true},
  --   {"stap": "In behandeling", "tijd": "",              "ok": false},
  --   {"stap": "Afgerond",       "tijd": "",              "ok": false}
  -- ]
);

create index if not exists svc_email_idx on service_meldingen(email);
create index if not exists svc_contractnummer_idx on service_meldingen(contractnummer);


-- ============================================================
-- VOORBEELDDATA — verwijder dit voordat je echte data importeert
-- ============================================================

-- Voorbeeld contracten (normaal gevuld door sync.js)
insert into contracten values
  (1, 'Jan de Vries',    'jan@voorbeeld.nl',   '06-12345678', '2022-03-01', 'FLH220001', 79.95,  '2022-03-15', '2026-03-15', 37, 48, 'Gazelle',  'Ultimate C8 HMB',   2022, 'Mat Zwart',  'GA2022001234', 500, 'https://...'),
  (2, 'Lisa Bakker',     'lisa@voorbeeld.nl',  '06-23456789', '2023-06-01', 'FLH230012', 94.95,  '2023-06-01', '2026-06-01', 23, 36, 'Batavus',  'Finez E-go',        2023, 'Wit',        'BA2023005678', 418, 'https://...'),
  (3, 'Pieter Smit',     'pieter@voorbeeld.nl','06-34567890', '2021-09-01', 'FLH210033', 69.95,  '2021-09-01', '2025-09-01', 44, 48, 'Cortina',  'E-Common',          2021, 'Grijs',      'CO2021009012', 374, 'https://...'),
  (4, 'Emma Jansen',     'emma@voorbeeld.nl',  '06-45678901', '2024-01-01', 'FLH240055', 109.95, '2024-01-15', '2027-01-15',  4, 36, 'Cowboy',   'C4 ST',             2024, 'Kiezelgrijs','CW2024002345',   0, 'https://...');

-- Voorbeeld facturen
insert into facturen (contractnummer, email, periode, factuurdatum, bedrag, status, factuur_url) values
  -- Jan de Vries
  ('FLH220001', 'jan@voorbeeld.nl', 'Mei 2025',      '2025-05-01', 79.95, 'outstanding', null),
  ('FLH220001', 'jan@voorbeeld.nl', 'April 2025',    '2025-04-01', 79.95, 'paid',        'https://...'),
  ('FLH220001', 'jan@voorbeeld.nl', 'Maart 2025',    '2025-03-01', 79.95, 'paid',        'https://...'),
  ('FLH220001', 'jan@voorbeeld.nl', 'Februari 2025', '2025-02-01', 79.95, 'paid',        'https://...'),
  ('FLH220001', 'jan@voorbeeld.nl', 'Januari 2025',  '2025-01-01', 79.95, 'paid',        'https://...'),
  -- Lisa Bakker
  ('FLH230012', 'lisa@voorbeeld.nl', 'Mei 2025',     '2025-05-01', 94.95, 'outstanding', null),
  ('FLH230012', 'lisa@voorbeeld.nl', 'April 2025',   '2025-04-01', 94.95, 'paid',        'https://...'),
  ('FLH230012', 'lisa@voorbeeld.nl', 'Maart 2025',   '2025-03-01', 94.95, 'paid',        'https://...');

-- Voorbeeld service meldingen
insert into service_meldingen values
  (
    's2347',
    'FLH220001',
    'jan@voorbeeld.nl',
    'Batterij / motor',
    'Batterij laadt niet volledig op',
    'assigned',
    'Bakker Fietsen Amsterdam',
    '2025-04-05',
    '[
      {"stap": "Ingediend",      "tijd": "5 apr, 14:00", "ok": true},
      {"stap": "Toegewezen",     "tijd": "5 apr, 16:45", "ok": true},
      {"stap": "In behandeling", "tijd": "",              "ok": false},
      {"stap": "Afgerond",       "tijd": "",              "ok": false}
    ]'
  ),
  (
    's2341',
    'FLH220001',
    'jan@voorbeeld.nl',
    'Lekke band',
    'Achterwiel lek gereden op de snelfietsroute',
    'completed',
    'Bakker Fietsen Amsterdam',
    '2025-03-26',
    '[
      {"stap": "Ingediend",      "tijd": "26 mrt, 10:00", "ok": true},
      {"stap": "Toegewezen",     "tijd": "26 mrt, 11:30", "ok": true},
      {"stap": "In behandeling", "tijd": "28 mrt, 09:00", "ok": true},
      {"stap": "Afgerond",       "tijd": "28 mrt, 14:30", "ok": true}
    ]'
  );
