const https = require('https');

const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5tbml6cmtnZHlweWxnbGxyZnVpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MjQ1NDYxMCwiZXhwIjoyMDk4MDMwNjEwfQ.jpaZHrH_aioInEvPFltAZqZYOcu0IgepKQk8aYRxJdE';

function testQueryEndpoint(host, path, body) {
  return new Promise((resolve) => {
    const dataStr = JSON.stringify(body);
    const req = https.request({
      hostname: host,
      path: path,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SERVICE_KEY}`,
        'apikey': SERVICE_KEY,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(dataStr)
      }
    }, res => {
      let d = '';
      res.on('data', chunk => d += chunk);
      res.on('end', () => resolve({ status: res.statusCode, data: d }));
    });
    req.on('error', e => resolve({ error: e.message }));
    req.write(dataStr);
    req.end();
  });
}

async function run() {
  console.log('Testing Management API SQL endpoints...');
  
  const res1 = await testQueryEndpoint('api.supabase.com', '/v1/projects/nmnizrkgdypylgllrfui/database/query', { query: 'SELECT 1;' });
  console.log('api.supabase.com database/query:', res1);

  const res2 = await testQueryEndpoint('nmnizrkgdypylgllrfui.supabase.co', '/rest/v1/rpc/exec_sql', { sql: 'SELECT 1;' });
  console.log('rest/v1/rpc/exec_sql:', res2);
}

run();
