// اختبار party-net.js على Node 22 (فيه WebSocket مدمج):
//   node --test games/birthday-party/party-net.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import crypto from 'node:crypto';

globalThis.location = { search: '', hostname: 'example.test' };

// سيرفر يقبل الترقية وبعدها يسكت تماماً — مثل شبكة جوال ماتت بدون ما ينقفل الاتصال
function silentServer() {
  return new Promise(res => {
    const srv = http.createServer();
    srv.socks = [];
    srv.on('upgrade', (req, sock) => {
      const acc = crypto.createHash('sha1').update(req.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
      sock.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + acc + '\r\n\r\n');
      sock.on('error', () => {}); srv.socks.push(sock);
    });
    srv.listen(0, '127.0.0.1', () => res(srv));
  });
}

test('a silent connection is detected as dead and reported offline', async () => {
  const srv = await silentServer();
  globalThis.location.search = '?ws=' + encodeURIComponent('ws://127.0.0.1:' + srv.address().port + '/ws/party');
  const { connect } = await import('./party-net.js');
  const states = [];
  const net = connect({ deadMs: 600, onStatus: on => states.push(on) });
  await new Promise(r => setTimeout(r, 1600));
  net.close(); srv.socks.forEach(s => s.destroy()); srv.close();
  assert.equal(states[0], true, 'connected first');
  assert.ok(states.includes(false), 'reported offline after silence: ' + JSON.stringify(states));
});
