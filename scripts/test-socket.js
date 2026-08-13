const net = require('net');

console.log('Testing net.connect to IPv6 address with family: 6...');

const socket = net.connect({
  host: '2406:da1a:314:7101:cfa2:3b53:157b:2298',
  port: 5432,
  family: 6
}, () => {
  console.log('✅ TCP CONNECTED TO SUPABASE IPv6 PORT 5432!');
  socket.end();
});

socket.on('error', (err) => {
  console.error('❌ TCP Socket error:', err.message);
});
