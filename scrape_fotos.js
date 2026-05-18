const axios = require('axios');
const fs = require('fs');

const GRAPHQL_URL = 'https://backend.fietsleaseholland.nl/graphql';
const FRONTEND_URL = 'https://www.fietsleaseholland.nl';
const CATEGORY_UID = 'MTA5'; // base64("109") — categorie leasefietsen
const PAGE_SIZE = 23;
const OUTPUT_FILE = 'fotos.json';
const DELAY_MS = 300;

const client = axios.create({
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Content-Type': 'application/json',
  },
  timeout: 15000,
});

async function fetchPage(currentPage) {
  const res = await client.post(GRAPHQL_URL, {
    query: `{
      products(
        filter: { category_uid: { eq: "${CATEGORY_UID}" } }
        pageSize: ${PAGE_SIZE}
        currentPage: ${currentPage}
      ) {
        total_count
        page_info { total_pages }
        items {
          name
          url_key
          small_image { url }
        }
      }
    }`,
  });
  return res.data?.data?.products;
}

async function scrape() {
  const seen = new Set();
  const results = [];

  console.log('Eerste pagina ophalen...');
  const first = await fetchPage(1);
  const totalPages = first?.page_info?.total_pages ?? 1;
  const totalCount = first?.total_count ?? 0;
  console.log(`${totalCount} producten over ${totalPages} pagina's\n`);

  const processItems = (items) => {
    let nieuw = 0;
    for (const p of items || []) {
      if (!p.name || p.name === 'Vraag een offerte aan!') continue;
      if (!p.small_image?.url) continue;
      if (seen.has(p.name)) continue;
      seen.add(p.name);
      results.push({
        naam: p.name,
        foto_url: p.small_image.url,
        product_url: p.url_key ? `${FRONTEND_URL}/${p.url_key}` : '',
      });
      nieuw++;
    }
    return nieuw;
  };

  const nieuwPagina1 = processItems(first?.items);
  console.log(`Pagina 1/${totalPages}... ${first?.items?.length ?? 0} fietsen, ${nieuwPagina1} nieuw`);

  for (let page = 2; page <= totalPages; page++) {
    await new Promise(r => setTimeout(r, DELAY_MS));
    process.stdout.write(`Pagina ${page}/${totalPages}... `);

    try {
      const data = await fetchPage(page);
      const nieuw = processItems(data?.items);
      console.log(`${data?.items?.length ?? 0} fietsen, ${nieuw} nieuw`);
    } catch (err) {
      console.log(`FOUT: ${err.message}`);
    }
  }

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(results, null, 2), 'utf8');
  console.log(`\nKlaar! ${results.length} unieke fietsen opgeslagen in ${OUTPUT_FILE}`);
}

scrape().catch(err => console.error('Scrape mislukt:', err.message));
