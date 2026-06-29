import WebSocket from 'ws';

const badUrl = 'ws://8.137.126.18/control/api/agent/ws?token=invalid-token-test';
const ws = new WebSocket(badUrl);
ws.on('open', () => console.log('UNEXPECTED: bad token connected'));
ws.on('close', (code, reason) => {
  console.log('bad-token-rejected', code, reason.toString());
  process.exit(code === 4001 ? 0 : 1);
});
ws.on('error', () => undefined);
setTimeout(() => {
  console.log('timeout');
  process.exit(1);
}, 8000);
