// اتصال صفحات الحفلة بخادم الحفلة (backend/party/party-server.js على /ws/party).
// نسخة ES module من games/intruder/station-net.js: إعادة اتصال تلقائية بمهلة
// متزايدة، ping كل 15ث، وحساب فرق الساعة مع الخادم (serverNow) عشان كل
// الجوالات تمشي على نفس الوقت.
//
// التخزين المحلي (لكل جهاز):
//   'party-host' → {code, token}   جلسة المذيع (يرجع لنفس الحفلة بعد التحديث)
//   'party-me'   → {code, id, key} جلسة اللاعب
const PROD_URL = 'wss://project-testing-akds.onrender.com/ws/party';

export function wsUrl() {
  const q = new URLSearchParams(location.search).get('ws');
  if (q) return q;
  const h = location.hostname;
  if (h === 'localhost' || h === '127.0.0.1') return 'ws://' + h + ':8787/ws/party';
  return PROD_URL;
}

export function readJSON(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
export function writeJSON(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* تخزين محجوب */ } }

// صفوف الحركة توصل مسطّحة بأعداد صحيحة (n, x سم, z سم, ry×100, a) ← [[n, x, z, ry, a], ...] بالمتر
export function unpackRows(d) { const out = []; for (let i = 0; i + 4 < d.length; i += 5) out.push([d[i], d[i + 1] / 100, d[i + 2] / 100, d[i + 3] / 100, d[i + 4]]); return out; }

// ---- فرق الساعة مع الخادم ----
const realNow = () => Date.now();
let samples = [], offset = 0;
function noteServerNow(sn) {
  if (typeof sn !== 'number') return;
  samples.push(sn - realNow()); if (samples.length > 30) samples.shift();
  // تأخير الشبكة يقلل التقدير دائماً، فأكبر عيّنة حديثة هي الأقرب
  offset = Math.max(...samples);
}
export function serverNow() { return realNow() + offset; }

export function connect({ onMessage, onOpen, onStatus } = {}) {
  let ws = null, closed = false, tries = 0, pingT = 0, retryT = 0;
  const queue = [];
  const raw = s => { if (ws && ws.readyState === 1) ws.send(s); else queue.push(s); };
  const send = obj => raw(JSON.stringify(obj));
  function open() {
    if (closed) return;
    try { ws = new WebSocket(wsUrl()); } catch (e) { retry(); return; }
    ws.onopen = () => {
      tries = 0; onStatus && onStatus(true);
      onOpen && onOpen();
      queue.splice(0).forEach(m => ws.send(m));
      clearInterval(pingT); pingT = setInterval(() => send({ t: 'ping', k: realNow() }), 15000);
      send({ t: 'ping', k: realNow() });
    };
    ws.onmessage = e => {
      let m; try { m = JSON.parse(e.data); } catch (err) { return; }
      if (!m) return;
      if (m.t === 's' || m.t === 'all' || m.t === 'pong') noteServerNow(m.now);
      if (m.t === 'pong') return;
      try { onMessage && onMessage(m); } catch (err) { console.error(err); }
    };
    ws.onclose = () => { clearInterval(pingT); onStatus && onStatus(false); retry(); };
    ws.onerror = () => { try { ws.close(); } catch (e) { /* مقفل أصلاً */ } };
  }
  function retry() {
    if (closed) return;
    clearTimeout(retryT);
    retryT = setTimeout(open, Math.min(8000, 500 * Math.pow(2, tries++)));
  }
  open();
  return {
    send,
    close() { closed = true; clearInterval(pingT); clearTimeout(retryT); try { ws && ws.close(); } catch (e) { /* مقفل */ } },
  };
}
