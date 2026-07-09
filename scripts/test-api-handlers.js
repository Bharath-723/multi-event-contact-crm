const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');

const envLocalPath = path.join(__dirname, '..', '.env.local');
const envLocal = fs.readFileSync(envLocalPath, 'utf8');
const env = {};
envLocal.split('\n').forEach(line => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    env[match[1]] = (match[2] || '').trim().replace(/^['"]|['"]$/g, '');
  }
});

const operatorId = '19559179-4edc-4ed0-834a-c552a601b6cb';
const secret = env.OPERATOR_JWT_SECRET || 'rathayatra-operator-secret-2026';
const token = jwt.sign({ operatorId, name: 'sreyas', email: 'sreyas@gmail.com' }, secret);

class MockRequest {
  constructor(url, headers = {}) {
    this.url = url;
    this.headers = new Map(Object.entries(headers));
  }
}

async function run() {
  process.env.NEXT_PUBLIC_SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.OPERATOR_JWT_SECRET = secret;

  const myRoute = require('../src/app/api/assignments/my/route.ts');
  const req = new MockRequest('http://localhost/api/assignments/my?search=Naresh', {
    cookie: `operator-session=${token}`
  });

  console.log("Calling GET /api/assignments/my?search=Naresh...");
  try {
    const res = await myRoute.GET(req);
    console.log("Status:", res.status);
    const body = await res.json();
    console.log("Body:", JSON.stringify(body, null, 2));
  } catch (err) {
    console.error("Error:", err);
  }
}

run();
