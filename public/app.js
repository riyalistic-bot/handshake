const $ = s => document.querySelector(s), app = $('#app');
let CFG = {};
const api = async (p, body) => {
  const r = await fetch('/api' + p, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json(); if (!r.ok) throw new Error(j.error || 'Something went wrong'); return j;
};
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const toast = m => { const t = $('#toast'); t.textContent = m; t.style.display = 'block'; setTimeout(() => t.style.display = 'none', 4500); };
const run = async (btn, fn) => { btn.disabled = true; const o = btn.textContent; btn.textContent = 'Working…'; try { await fn(); } catch (e) { toast(e.message); btn.disabled = false; btn.textContent = o; } };
const money = d => `${d.currency} ${Number(d.amount).toFixed(2)}`;

const routes = [[/^#\/new/, newDeal], [/^#\/deal\/(.+)/, dealRoom], [/^#\/radar/, radar], [/^#\/seller\/(.+)/, seller], [/^#\/dashboard/, dash]];
async function route() {
  const h = location.hash || '#/';
  document.querySelectorAll('nav a').forEach(a => a.classList.toggle('on', h.startsWith(a.getAttribute('href'))));
  window.scrollTo(0, 0);
  for (const [re, fn] of routes) { const m = h.match(re); if (m) return fn(...m.slice(1)); }
  landing();
}
window.addEventListener('hashchange', route);
(async () => {
  CFG = await api('/config');
  $('#status').innerHTML = `<span class="pill ${CFG.paypalLive ? 'ok' : 'warn'}">PayPal ${CFG.paypalLive ? 'sandbox' : 'mock'}</span><span class="pill ${CFG.aiLive ? 'ok' : 'warn'}">AI ${CFG.aiLive ? 'Claude' : 'offline'}</span>`;
  route();
})();

function landing() {
  app.innerHTML = `
  <h1>Pay strangers online.<br><span class="grad">PayPal holds the money. AI decides who is right.</span></h1>
  <p class="sub">Handshake locks your payment in PayPal until the seller proves they delivered. An AI judge checks the proof and tells PayPal to pay the seller or refund you, in minutes.</p>
  <div class="row" style="margin-top:22px"><a class="btn" href="#/new">Start a Handshake</a><a class="btn alt" href="#/radar">Check a seller with Scam Radar</a></div>
  <div class="vault"><div class="node"><b>You</b><span class="mut">pay</span></div><div class="wire"></div><div class="node mid"><b>PayPal vault</b><span class="mut">holds funds</span></div><div class="wire"></div><div class="node"><b>Seller</b><span class="mut">or refund to you</span></div></div>
  <div class="cols">
   <div class="card"><h3>Handshake</h3><p class="mut">AI-judged escrow. The AI writes the deal rules, reads the seller's photo proof and both sides' statements, then PayPal captures or voids the payment.</p></div>
   <div class="card"><h3>Scam Radar</h3><p class="mut">Paste a listing or chat before you pay. Get a green, yellow or red light with a one-line reason, and start a Handshake if it's risky.</p></div>
   <div class="card"><h3>Trust Badge</h3><p class="mut">Every honest deal adds to a seller's public record. Share the badge on Instagram, WhatsApp or OLX so buyers trust you.</p></div></div>
  <div class="card" style="margin-top:22px"><h2>Try the demo</h2><p class="mut">One click creates a delivered deal. Then press "Ask AI to judge" and watch the money move.</p>
  <div class="row"><button class="btn" id="d1">Honest seller gets paid</button><button class="btn alt" id="d2">Cheater gets caught</button></div></div>`;
  [['d1', 'honest'], ['d2', 'cheater']].forEach(([id, sc]) => $('#' + id).onclick = e => run(e.target, async () => { const d = await api('/demo/' + sc, {}); location.hash = '#/deal/' + d.id; }));
}

function newDeal() {
  const p = JSON.parse(sessionStorage.getItem('prefill') || '{}'); sessionStorage.removeItem('prefill');
  app.innerHTML = `<h2>New Handshake</h2><p class="mut">Describe the trade in plain words. The AI turns it into clear rules.</p>
  <div class="card"><label>What is being sold?</label><input id="t" value="${esc(p.title)}" placeholder="Vintage toy car">
  <label>Details and agreement</label><textarea id="ds" placeholder="Red die-cast car, boxed, handed over in person…">${esc(p.description)}</textarea>
  <div class="two"><div><label>Price (${CFG.currency})</label><input id="a" type="number" min="1" step="0.01" value="${esc(p.amount)}"></div><div><label>Seller name</label><input id="sn" value="${esc(p.seller)}" placeholder="Rahul Verma"></div></div>
  <div class="two"><div><label>Your name (buyer)</label><input id="bn" placeholder="Asha"></div><div><label>Seller PayPal email (optional)</label><input id="se" placeholder="seller@example.com"></div></div>
  <p class="mut mono">Leave the seller email empty in sandbox testing; the money then goes to your own sandbox business account.</p>
  <button class="btn" id="go">Create deal</button></div>`;
  $('#go').onclick = e => run(e.target, async () => {
    const d = await api('/deals', { title: $('#t').value, description: $('#ds').value, amount: $('#a').value, sellerName: $('#sn').value, buyerName: $('#bn').value, sellerEmail: $('#se').value });
    location.hash = '#/deal/' + d.id;
  });
}

let sdkLoaded = null;
const loadSdk = () => sdkLoaded ||= new Promise((res, rej) => { const s = document.createElement('script'); s.src = `https://www.paypal.com/sdk/js?client-id=${CFG.paypalClientId}&intent=authorize&currency=${CFG.currency}`; s.onload = res; s.onerror = () => rej(new Error('Could not load PayPal SDK. Check your Client ID.')); document.head.appendChild(s); });

async function dealRoom(id) {
  const d = await api('/deals/' + id).catch(e => { app.innerHTML = `<div class="card">${esc(e.message)}</div>`; });
  if (!d) return;
  const order = ['CREATED', 'FUNDED', 'DELIVERED', 'RESOLVED'], idx = d.status === 'RELEASED' || d.status === 'REFUNDED' ? 3 : order.indexOf(d.status);
  const steps = ['Agreed', 'Funds held', 'Proof uploaded', 'AI verdict', d.status === 'REFUNDED' ? 'Refunded' : 'Seller paid'];
  const tl = steps.map((s, i) => `<div class="st ${(i <= idx || (i === 4 && idx === 3)) ? (d.status === 'REFUNDED' && i === 4 ? 'bad' : 'done') : ''}">${s}</div>`).join('');
  let action = '';
  if (d.status === 'CREATED') action = `<h3>Pay into the PayPal vault</h3><p class="mut">${CFG.paypalLive ? 'Approve with your PayPal sandbox buyer account. Funds are held, not paid out.' : 'No PayPal keys found, so this simulates the hold.'}</p>${CFG.paypalLive ? '<div id="pp"></div>' : '<button class="btn" id="mf">Simulate PayPal hold</button>'}`;
  if (d.status === 'FUNDED') action = `<h3>Seller: deliver and upload proof</h3><label>Photo proof</label><input type="file" id="img" accept="image/*"><label>Your statement</label><textarea id="ss" placeholder="What did you deliver, and how?"></textarea><button class="btn" id="up">Submit proof</button>`;
  if (d.status === 'DELIVERED') action = `<h3>Buyer: confirm or dispute</h3><div class="mut">Seller says: ${esc(d.sellerStatement) || '(nothing)'}</div>${d.proofImage ? `<img class="proof" src="${d.proofImage}" alt="Seller proof">` : '<p class="mut">No photo uploaded.</p>'}<label>Your statement</label><textarea id="bs">${esc(d.buyerStatement)}</textarea><button class="btn" id="jd">Ask AI to judge</button>`;
  const v = d.verdict ? `<div class="card verdict ${d.verdict.decision}" style="margin-top:18px"><h2>${d.verdict.decision === 'release' ? 'Verdict: release to seller' : 'Verdict: refund to buyer'}</h2><div class="mono mut">confidence ${esc(d.verdict.confidence)}%</div><p>${esc(d.verdict.reason)}</p><ul class="rules">${(d.verdict.evidence || []).map(e => `<li>${esc(e)}</li>`).join('')}</ul>
   <p class="mut">${d.status === 'RELEASED' ? 'PayPal captured the payment and the seller was paid.' : 'PayPal voided the authorization and the hold on the buyer was released.'}</p><a class="btn alt" href="#/seller/${d.sellerHandle}">View ${esc(d.sellerName)}'s Trust Badge</a></div>` : '';
  app.innerHTML = `<div class="row"><h2>${esc(d.title)}</h2><span class="badge b-${d.status}">${d.status}</span></div>
  <div class="mono mut">deal ${d.id} · ${money(d)} · ${esc(d.buyerName)} → <a class="lnk" href="#/seller/${d.sellerHandle}">${esc(d.sellerName)}</a></div><div class="tl">${tl}</div>
  <div class="two" style="align-items:start"><div class="card"><h3>AI-written rules</h3><ul class="rules">${d.rules.map(r => `<li>${esc(r)}</li>`).join('')}</ul><div class="mut"><b>Proof required:</b> ${esc(d.proofRequired)}</div></div>
  <div class="card"><h3>Activity</h3><div class="log">${d.events.slice().reverse().map(e => `<div>${new Date(e.t).toLocaleTimeString()} · ${esc(e.msg)}</div>`).join('')}</div></div></div>
  ${action ? `<div class="card" style="margin-top:18px">${action}</div>` : ''}${v}`;
  const re = () => dealRoom(id);
  if ($('#mf')) $('#mf').onclick = e => run(e.target, async () => { await api(`/deals/${id}/mock-fund`, {}); re(); });
  if ($('#pp')) try { await loadSdk(); paypal.Buttons({ style: { color: 'blue', shape: 'pill' },
    createOrder: async () => (await api(`/deals/${id}/paypal/create`, {})).orderId,
    onApprove: async () => { await api(`/deals/${id}/paypal/authorize`, {}); re(); },
    onError: e => toast('PayPal error: ' + e) }).render('#pp'); } catch (e) { toast(e.message); }
  if ($('#up')) $('#up').onclick = e => run(e.target, async () => {
    const f = $('#img').files[0]; const image = f ? await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(f); }) : null;
    if (f && f.size > 8e6) throw new Error('Photo is over 8 MB. Choose a smaller one.');
    await api(`/deals/${id}/proof`, { image, statement: $('#ss').value }); re(); });
  if ($('#jd')) $('#jd').onclick = e => run(e.target, async () => { await api(`/deals/${id}/judge`, { buyerStatement: $('#bs').value }); re(); });
}

function radar() {
  app.innerHTML = `<h2>Scam Radar</h2><p class="mut">Paste the listing or your chat with the seller. Get a verdict before you pay.</p>
  <div class="card"><label>Listing or chat</label><textarea id="tx" placeholder="Seller: iPhone 15 for 100$, only one left, pay now via gift card, no escrow please"></textarea>
  <label>Seller name (optional, checks their Trust Badge)</label><input id="sh" placeholder="Rahul Verma"><div style="margin-top:16px"><button class="btn" id="sc">Scan</button></div></div><div id="out"></div>`;
  $('#sc').onclick = e => run(e.target, async () => {
    const r = await api('/radar', { text: $('#tx').value, sellerHandle: $('#sh').value });
    const label = { green: 'LOOKS SAFE', yellow: 'BE CAREFUL', red: 'HIGH RISK' }[r.light] || r.light;
    $('#out').innerHTML = `<div class="card" style="margin-top:18px;text-align:center"><div class="light ${r.light}">${label}</div><h3>${esc(r.reason)}</h3><ul class="rules" style="display:inline-block;text-align:left">${(r.signals || []).map(s => `<li>${esc(s)}</li>`).join('')}</ul>
    ${r.light !== 'green' ? '<div><button class="btn" id="hs">Use Handshake for this deal</button></div>' : '<p class="mut">Still, Handshake keeps your money safe at no extra effort.</p>'}</div>`;
    if ($('#hs')) $('#hs').onclick = () => { sessionStorage.setItem('prefill', JSON.stringify({ seller: $('#sh').value, description: $('#tx').value.slice(0, 300) })); location.hash = '#/new'; };
    e.target.disabled = false; e.target.textContent = 'Scan';
  });
}

async function seller(h) {
  const s = await api('/sellers/' + h), snip = `<a href="${s.pageUrl}"><img src="${s.badgeUrl}" alt="${esc(s.name)} Handshake badge"></a>`;
  app.innerHTML = `<div class="card" style="text-align:center"><img src="/badge/${s.handle}.svg" alt="Trust badge" style="max-width:100%"><div class="row" style="justify-content:center;margin-top:18px">
  <div><div class="big grad">${s.safe}</div><span class="mut">safe deals</span></div><div style="width:40px"></div><div><div class="big" style="color:var(--r)">${s.scams}</div><span class="mut">scams / lost disputes</span></div></div>
  <p class="mut">${s.safe + s.scams ? '' : 'No deals yet. Every honest deal adds to this record.'}</p></div>
  <div class="card" style="margin-top:18px"><h3>Share this badge</h3><p class="mut">Put it in your Instagram bio, WhatsApp status or OLX listing.</p>
  <b>Profile link</b><code class="cp">${esc(s.pageUrl)}</code><b>Badge image (paste in bios/listings)</b><code class="cp">${esc(s.badgeUrl)}</code><b>HTML embed</b><code class="cp">${esc(snip)}</code>
  <button class="btn alt" id="cp">Copy profile link</button></div>`;
  $('#cp').onclick = () => navigator.clipboard.writeText(s.pageUrl).then(() => toast('Link copied'));
}

async function dash() {
  const [deals, lb] = await Promise.all([api('/deals'), api('/leaderboard')]);
  app.innerHTML = `<h2>Dashboard</h2><div class="two" style="align-items:start;margin-top:14px">
  <div class="card"><h3>Recent deals</h3>${deals.length ? `<table><tr><th>Deal</th><th>Amount</th><th>Status</th></tr>${deals.map(d => `<tr><td><a class="lnk" href="#/deal/${d.id}">${esc(d.title)}</a></td><td>${money(d)}</td><td><span class="badge b-${d.status}">${d.status}</span></td></tr>`).join('')}</table>` : '<p class="mut">No deals yet. <a class="lnk" href="#/new">Create your first Handshake</a>.</p>'}</div>
  <div class="card"><h3>Most trusted sellers</h3>${lb.length ? `<table><tr><th>Seller</th><th>Safe</th><th>Scams</th></tr>${lb.map(s => `<tr><td><a class="lnk" href="#/seller/${s.handle}">${esc(s.name)}</a></td><td>${s.safe}</td><td>${s.scams}</td></tr>`).join('')}</table>` : '<p class="mut">Complete a deal to appear here.</p>'}</div></div>`;
}
