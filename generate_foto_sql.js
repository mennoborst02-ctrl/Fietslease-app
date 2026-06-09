const { createClient } = require("@supabase/supabase-js");
const axios = require("axios");
const fs = require("fs");
require("dotenv").config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const GRAPHQL_URL = "https://backend.fietsleaseholland.nl/graphql";
const CATEGORY_UID = "MTA5";
const PAGE_SIZE = 23;

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
    const prefix = fietsen.find((f) => normalize(f.naam).startsWith(merkModel));
    if (prefix) return prefix.foto_url;
  }
  const prefixMerk = fietsen.find((f) => normalize(f.naam).startsWith(merkNorm));
  if (prefixMerk) return prefixMerk.foto_url;
  return null;
}

async function scrapeFotos() {
  const client = axios.create({ headers: { "User-Agent": "Mozilla/5.0", "Content-Type": "application/json" }, timeout: 15000 });
  const first = await client.post(GRAPHQL_URL, {
    query: `{ products(filter:{category_uid:{eq:"${CATEGORY_UID}"}}, pageSize:${PAGE_SIZE}, currentPage:1) { page_info { total_pages } items { name small_image { url } } } }`,
  });
  const totalPages = first.data?.data?.products?.page_info?.total_pages ?? 1;
  const items = [...(first.data?.data?.products?.items || [])];
  for (let page = 2; page <= totalPages; page++) {
    await new Promise((r) => setTimeout(r, 200));
    const res = await client.post(GRAPHQL_URL, {
      query: `{ products(filter:{category_uid:{eq:"${CATEGORY_UID}"}}, pageSize:${PAGE_SIZE}, currentPage:${page}) { items { name small_image { url } } } }`,
    });
    items.push(...(res.data?.data?.products?.items || []));
  }
  return items
    .filter((i) => i.name && i.name !== "Vraag een offerte aan!" && i.small_image?.url)
    .map((i) => ({ naam: i.name, foto_url: i.small_image.url }));
}

function esc(s) {
  return (s || "").replace(/'/g, "''");
}

async function run() {
  console.log("Fietsen scrapen van FLH website...");
  const fietsen = await scrapeFotos();
  console.log(`${fietsen.length} fietsen gescraped`);

  console.log("Unieke merk+model combinaties ophalen uit Supabase...");
  const { data, error } = await supabase.from("contracten").select("merk, model").not("merk", "is", null).not("model", "is", null);
  if (error) { console.error(error.message); return; }

  const uniek = {};
  for (const r of data) {
    const key = normalize(r.merk) + "|" + normalize(r.model);
    if (!uniek[key]) uniek[key] = { merk: r.merk, model: r.model };
  }
  const combinaties = Object.values(uniek);
  console.log(`${combinaties.length} unieke merk+model combinaties`);

  const matches = [], geen_match = [];
  const sql_lines = [
    "-- Gegenereerd door generate_foto_sql.js",
    "-- Bijwerken van foto_url per unieke merk+model combinatie",
    "-- Voer uit in Supabase SQL-editor",
    "",
  ];

  for (const c of combinaties) {
    const url = findFoto(fietsen, c.merk, c.model);
    if (url) {
      matches.push(`${c.merk} ${c.model}`);
      sql_lines.push(`UPDATE contracten SET foto_url = '${esc(url)}' WHERE merk = '${esc(c.merk)}' AND model = '${esc(c.model)}';`);
    } else {
      geen_match.push(`${c.merk} ${c.model}`);
    }
  }

  fs.writeFileSync("update_foto_urls_model.sql", sql_lines.join("\n") + "\n");

  console.log(`\n✓ ${matches.length} matches → update_foto_urls_model.sql`);
  console.log(`✗ ${geen_match.length} zonder match:`);
  geen_match.forEach((n) => console.log(`  - ${n}`));
}

run().catch((e) => console.error("Fout:", e.message));
