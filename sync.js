const mysql = require("mysql2/promise");
const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function formatDate(value) {
  if (!value) return null;
  const d = new Date(value);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

async function sync() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: parseInt(process.env.DB_PORT),
  });

  const [rows] = await conn.query("SELECT * FROM klanten_data");
  await conn.end();

  const records = rows.map((row) => ({
    id: row.id,
    naam: row.naam,
    email: row.email,
    telefoon: row.telefoon_nummer,
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

  const { error: deleteError } = await supabase
    .from("contracten")
    .delete()
    .neq("id", 0);

  if (deleteError) {
    console.error("Supabase verwijder fout:", deleteError.message);
    return;
  }

  const { error: insertError } = await supabase
    .from("contracten")
    .insert(records);

  if (insertError) {
    console.error("Supabase insert fout:", insertError.message);
  } else {
    console.log(`${records.length} rijen gesynchroniseerd naar contracten.`);
  }
}

sync().catch((e) => console.error("Sync fout:", e.message));
