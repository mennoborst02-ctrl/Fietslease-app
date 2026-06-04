const mysql = require("mysql2/promise");
const axios = require("axios");
const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const GRAPHQL_URL = "https://backend.fietsleaseholland.nl/graphql";
const FRONTEND_URL = "https://www.fietsleaseholland.nl";
const CATEGORY_UID = "MTA5";
const PAGE_SIZE = 23;

function formatDate(value) {
  if (!value) return null;
  const d = new Date(value);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function normalize(str) {
  return (str || "").toLowerCase().replace(/\s+/g, " ").trim();
}

const MODEL_ONBEKEND = /^flh\d+/i;

function findFoto(fietsen, merk, model) {
  if (!merk) return null;
  const merkNorm = normalize(merk);
  if (merkNorm.length < 3) return null;

  const modelGeldig = model && !MODEL_ONBEKEND.test(model.trim());
  const merkModel = modelGeldig ? normalize(`${merk} ${model}`) : null;

  if (merkModel) {
    const exact = fietsen.find((f) => normalize(f.naam) === merkModel);
    if (exact) return exact.foto_url;
    const prefixFull = fietsen.find((f) => normalize(f.naam).startsWith(merkModel));
    if (prefixFull) return prefixFull.foto_url;
  }

  const prefixMerk = fietsen.find((f) => normalize(f.naam).startsWith(merkNorm));
  if (prefixMerk) return prefixMerk.foto_url;

  return null;
}

async function scrapeFotos() {
  const client = axios.create({
    headers: { "User-Agent": "Mozilla/5.0", "Content-Type": "application/json" },
    timeout: 15000,
  });

  const results = [];
  const seen = new Set();

  const first = await client.post(GRAPHQL_URL, {
    query: `{ products(filter:{category_uid:{eq:"${CATEGORY_UID}"}}, pageSize:${PAGE_SIZE}, currentPage:1) { page_info { total_pages } items { name url_key small_image { url } } } }`,
  });
  const totalPages = first.data?.data?.products?.page_info?.total_pages ?? 1;

  const processItems = (items) => {
    for (const p of items || []) {
      if (!p.name || p.name === "Vraag een offerte aan!" || !p.small_image?.url || seen.has(p.name)) continue;
      seen.add(p.name);
      results.push({ naam: p.name, foto_url: p.small_image.url, product_url: p.url_key ? `${FRONTEND_URL}/${p.url_key}` : "" });
    }
  };

  processItems(first.data?.data?.products?.items);

  for (let page = 2; page <= totalPages; page++) {
    await new Promise((r) => setTimeout(r, 200));
    const res = await client.post(GRAPHQL_URL, {
      query: `{ products(filter:{category_uid:{eq:"${CATEGORY_UID}"}}, pageSize:${PAGE_SIZE}, currentPage:${page}) { items { name url_key small_image { url } } } }`,
    });
    processItems(res.data?.data?.products?.items);
  }

  console.log(`${results.length} fietsen gescraped van FLH website`);
  return results;
}

async function sync() {
  // 1. MySQL → Supabase
  console.log("Stap 1: Contracten synchroniseren vanuit MySQL...");
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: parseInt(process.env.DB_PORT),
  });

  const [rows] = await conn.query("SELECT * FROM contracten");
  const [factuurRows] = await conn.query("SELECT * FROM facturen").catch(() => { console.warn("Tabel 'facturen' niet gevonden, overgeslagen."); return [[]]; });
  const [ticketRows] = await conn.query("SELECT * FROM tickets").catch(() => { console.warn("Tabel 'tickets' niet gevonden, overgeslagen."); return [[]]; });
  await conn.end();

  const records = rows.map((row) => ({
    id: row.id,
    naam: row.naam,
    email: row.email || '',
    telefoon: row.telefoon,
    klant_sinds: formatDate(row.klant_sinds),
    contractnummer: row.contractnummer,
    maandbedrag: row.maandbedrag,
    startdatum: formatDate(row.startdatum),
    einddatum: formatDate(row.einddatum),
    maanden_verstreken: row.maanden_verstreken,
    contracttijd: row.contracttijd,
    merk: row.merk,
    model: row.model,
    bouwjaar: row.bouwjaar,
    kleur: row.kleur,
    framenummer: row.framenummer,
    batterij_wh: row.batterij_wh,
  }));

  const { error: deleteError } = await supabase.from("contracten").delete().lt("id", 9000);
  if (deleteError) { console.error("Verwijder fout:", deleteError.message); return; }
  const { error: insertError } = await supabase.from("contracten").insert(records);
  if (insertError) { console.error("Insert fout:", insertError.message); return; }
  console.log(`${records.length} contracten gesynchroniseerd`);

  // 2. Scrape actuele fietsen van FLH website
  console.log("\nStap 2: Fietsfoto's scrapen van FLH website...");
  const fietsen = await scrapeFotos();

  // 3. Foto's koppelen aan contracten
  console.log("\nStap 3: Foto's koppelen aan contracten...");
  const updates = [];
  let gevonden = 0, niets = 0;

  for (const r of records) {
    const foto_url = findFoto(fietsen, r.merk, r.model);
    updates.push({ id: r.id, foto_url: foto_url || null });
    if (foto_url) gevonden++; else niets++;
  }

  console.log(`${gevonden} matches gevonden, ${niets} zonder match`);

  // Batch updates per 50
  for (let i = 0; i < updates.length; i += 50) {
    const batch = updates.slice(i, i + 50);
    await Promise.all(
      batch.map((u) => supabase.from("contracten").update({ foto_url: u.foto_url }).eq("id", u.id))
    );
  }
  console.log(`\nKlaar! ${updates.length} contracten bijgewerkt met foto_url.`);

  // 4. Facturen synchroniseren
  if (factuurRows.length > 0) {
    console.log("\nStap 4: Facturen synchroniseren vanuit MySQL...");
    const facturen = factuurRows.map((row) => ({
      contractnummer: row.contractnummer,
      email:          row.email || '',
      periode:        row.periode,
      factuurdatum:   formatDate(row.factuurdatum),
      bedrag:         row.bedrag,
      status:         row.status,
      factuur_url:    row.factuur_url || null,
    }));
    const { error: delFact } = await supabase.from("facturen").delete().neq("id", 0);
    if (delFact) { console.warn("Facturen tabel niet beschikbaar in Supabase, overgeslagen."); }
    else {
      const { error: insFact } = await supabase.from("facturen").insert(facturen);
      if (insFact) { console.error("Insert facturen fout:", insFact.message); }
      else { console.log(`${facturen.length} facturen gesynchroniseerd`); }
    }
  } else {
    console.log("\nStap 4: Geen facturen gevonden in MySQL, overgeslagen.");
  }

  // 5. Tickets synchroniseren
  if (ticketRows.length > 0) {
    console.log("\nStap 5: Tickets synchroniseren vanuit MySQL...");
    const tickets = ticketRows.map((row) => ({
      id:             row.id,
      contractnummer: row.contractnummer,
      email:          row.email || '',
      categorie:      row.categorie || 'Overig',
      omschrijving:   row.omschrijving || '',
      status:         row.status || 'Nieuw',
      locatie:        row.locatie || null,
      aanmaakdatum:   formatDate(row.aanmaakdatum) || formatDate(new Date()),
      tijdlijn:       typeof row.tijdlijn === 'string' ? JSON.parse(row.tijdlijn) : (row.tijdlijn || null),
    }));
    const { error: delTickets } = await supabase.from("tickets").delete().lt("id", 9000);
    if (delTickets) { console.error("Verwijder tickets fout:", delTickets.message); }
    else {
      const { error: insTickets } = await supabase.from("tickets").insert(tickets);
      if (insTickets) { console.error("Insert tickets fout:", insTickets.message); }
      else { console.log(`${tickets.length} tickets gesynchroniseerd`); }
    }
  } else {
    console.log("\nStap 5: Geen tickets gevonden in MySQL, overgeslagen.");
  }

  console.log("\n✓ Sync volledig afgerond.");
}

sync().catch((e) => console.error("Sync fout:", e.message));
