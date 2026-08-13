const https = require('https');

const SUPABASE_URL = 'https://nmnizrkgdypylgllrfui.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5tbml6cmtnZHlweWxnbGxyZnVpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MjQ1NDYxMCwiZXhwIjoyMDk4MDMwNjEwfQ.jpaZHrH_aioInEvPFltAZqZYOcu0IgepKQk8aYRxJdE';

function fetchOpenAPI() {
  return new Promise((resolve, reject) => {
    const url = new URL(SUPABASE_URL + '/rest/v1/');
    const req = https.request(url, {
      headers: {
        'apikey': SERVICE_KEY,
        'Authorization': `Bearer ${SERVICE_KEY}`,
      }
    }, res => {
      let d = '';
      res.on('data', chunk => d += chunk);
      res.on('end', () => resolve(JSON.parse(d)));
    });
    req.on('error', reject);
    req.end();
  });
}

async function checkRPCs() {
  try {
    const spec = await fetchOpenAPI();
    const paths = Object.keys(spec.paths || {}).filter(p => p.startsWith('/rpc/'));
    console.log('Available RPC endpoints in database:');
    paths.forEach(p => console.log('  ', p));
  } catch (e) {
    console.error('Error:', e.message);
  }
}

checkRPCs();
