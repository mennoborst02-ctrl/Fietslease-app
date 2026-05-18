require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function normalize(str) {
  return (str || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function findFoto(fietsen, merk, model) {
  const merkModel = normalize(`${merk} ${model}`);
  const merkNorm = normalize(merk);

  // 1. Exacte match op merk + model
  const exact = fietsen.find(f => normalize(f.naam) === merkModel);
  if (exact) return { foto: exact, type: 'exact' };

  // 2. Naam begint met merk + model
  const prefixFull = fietsen.find(f => normalize(f.naam).startsWith(merkModel));
  if (prefixFull) return { foto: prefixFull, type: 'merk+model' };

  // 3. Naam begint met merk
  const prefixMerk = fietsen.find(f => normalize(f.naam).startsWith(merkNorm));
  if (prefixMerk) return { foto: prefixMerk, type: 'merk' };

  // 4. Fallback: merk zit ergens in de naam
  const fuzzy = fietsen.find(f => normalize(f.naam).includes(merkNorm));
  if (fuzzy) return { foto: fuzzy, type: 'fuzzy' };

  return null;
}

async function koppel() {
  const fietsen = JSON.parse(fs.readFileSync('fotos.json', 'utf8'));
  console.log(`${fietsen.length} fietsen geladen uit fotos.json`);

  const { data: contracten, error } = await supabase.from('contracten').select('id, merk, model, foto_url');
  if (error) { console.error('Supabase fout:', error.message); return; }
  console.log(`${contracten.length} contracten opgehaald uit Supabase\n`);

  let gevonden = 0, niets = 0, updates = [];

  for (const c of contracten) {
    const result = findFoto(fietsen, c.merk, c.model);
    if (result) {
      console.log(`✓ [${result.type}] ${c.merk} ${c.model} → ${result.foto.naam}`);
      updates.push({ id: c.id, foto_url: result.foto.foto_url });
      gevonden++;
    } else {
      console.log(`✗ Geen match: ${c.merk} ${c.model}`);
      niets++;
    }
  }

  console.log(`\n${gevonden} matches gevonden, ${niets} zonder match`);
  if (updates.length === 0) { console.log('Niets bij te werken.'); return; }

  console.log('\nSupabase bijwerken...');
  let bijgewerkt = 0;
  for (const u of updates) {
    const { error: upErr } = await supabase
      .from('contracten')
      .update({ foto_url: u.foto_url })
      .eq('id', u.id);
    if (upErr) {
      console.error(`  Fout bij id ${u.id}:`, upErr.message);
    } else {
      bijgewerkt++;
    }
  }
  console.log(`\nKlaar! ${bijgewerkt}/${updates.length} contracten bijgewerkt met foto_url.`);
}

koppel().catch(e => console.error('Fout:', e.message));
