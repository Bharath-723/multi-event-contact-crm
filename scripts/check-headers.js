const https = require('https');

function getProjectRegion() {
  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'nmnizrkgdypylgllrfui.supabase.co',
      path: '/rest/v1/',
      method: 'GET',
      headers: {
        'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5tbml6cmtnZHlweWxnbGxyZnVpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MjQ1NDYxMCwiZXhwIjoyMDk4MDMwNjEwfQ.jpaZHrH_aioInEvPFltAZqZYOcu0IgepKQk8aYRxJdE',
      }
    }, res => {
      console.log('Response headers:', res.headers);
      resolve(res.headers);
    });
    req.on('error', console.error);
    req.end();
  });
}

getProjectRegion();
