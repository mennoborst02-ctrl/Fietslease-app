const https = require('https');
const fs = require('fs');

const TOTAL_PAGES = 23;
const OUTPUT_FILE = 'fietsen.json';

function fetchPage(url) {
  return new Promise((resolve, reject) => {
    const opts = { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } };
    https.get(url, opts, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        const loc = res.headers.location;
        const next = loc.startsWith('http') ? loc : 'https://fietsleaseholland.nl' + loc;
        return fetchPage(next).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

function extractFietsen(html) {
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return [];
  const data = JSON.parse(m[1]);
  const items = data?.props?.pageProps?.products?.items || [];
  return items.map(p => ({
    naam: p.name,
    foto_url: p.small_image?.url || ''
  })).filter(p => p.naam && p.naam !== 'Vraag een offerte aan!');
}

async function scrape() {
  const alleFietsen = [];
  console.log(`Scrapen van ${TOTAL_PAGES} pagina's...`);

  for (let page = 1; page <= TOTAL_PAGES; page++) {
    const url = page === 1
      ? 'https://fietsleaseholland.nl/leasefietsen'
      : `https://fietsleaseholland.nl/leasefietsen?p=${page}`;

    process.stdout.write(`Pagina ${page}/${TOTAL_PAGES}... `);
    try {
      const html = await fetchPage(url);
      const fietsen = extractFietsen(html);
      alleFietsen.push(...fietsen);
      console.log(`${fietsen.length} fietsen`);
    } catch (err) {
      console.log(`FOUT: ${err.message}`);
    }

    if (page < TOTAL_PAGES) await new Promise(r => setTimeout(r, 300));
  }

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(alleFietsen, null, 2), 'utf8');
  console.log(`\nKlaar! ${alleFietsen.length} fietsen opgeslagen in ${OUTPUT_FILE}`);
}

scrape().catch(err => console.error('Scrape mislukt:', err.message));
