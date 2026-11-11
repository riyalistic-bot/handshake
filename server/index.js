require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const express = require('express'), path = require('path'), crypto = require('crypto');
const db = require('./db'), ai = require('./ai'), pp = require('./paypal');
const app = express();
app.use(express.json({ limit: '12mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));
const BASE = () => process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
const wrap = f => (q, s) => Promise.resolve(f(q, s)).catch(e => { console.error(e); s.status(500).json({ error: e.message }); });
const slug = n => String(n).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'seller';
const log = (d, msg) => d.events.push({ t: Date.now(), msg });
const load = (q, s) => { const d = db.getDeal(q.params.id); if (!d) { s.status(404).json({ error: 'Deal not found' }); return null; } return d; };

app.get('/api/config', (q, s) => s.json({ paypalClientId: pp.live() ? process.env.PAYPAL_CLIENT_ID : null, paypalLive: pp.live(), aiLive: ai.live(), currency: process.env.CURRENCY || 'USD', baseUrl: BASE() }));

async function createDeal(b) {
  const amount = Number(b.amount);
  if (!b.title || !b.sellerName || !(amount > 0)) throw new Error('Title, seller name and a price above 0 are required.');
  const d = { id: crypto.randomBytes(4).toString('hex'), title: b.title, description: b.description || '', amount, currency: process.env.CURRENCY || 'USD',
    buyerName: b.buyerName || 'Buyer', sellerName: b.sellerName, sellerHandle: slug(b.sellerName), sellerEmail: (b.sellerEmail || '').trim(),
    status: 'CREATED', events: [], created: Date.now() };
  const r = await ai.rules(d); d.rules = r.rules; d.proofRequired = r.proof_required;
  log(d, 'Deal agreed. AI wrote the rules.'); db.saveDeal(d); return d;
}
app.post('/api/deals', wrap(async (q, s) => s.json(await createDeal(q.body))));
app.get('/api/deals', (q, s) => s.json(db.listDeals().map(({ proofImage, ...d }) => d)));
app.get('/api/deals/:id', (q, s) => { const d = load(q, s); if (d) s.json(d); });

// --- PayPal: hold the buyer's money ---
app.post('/api/deals/:id/paypal/create', wrap(async (q, s) => { const d = load(q, s); if (!d) return; d.orderId = await pp.createOrder(d); db.saveDeal(d); s.json({ orderId: d.orderId }); }));
app.post('/api/deals/:id/paypal/authorize', wrap(async (q, s) => {
  const d = load(q, s); if (!d) return;
  d.authId = await pp.authorize(d.orderId); d.status = 'FUNDED'; log(d, `PayPal is holding ${d.amount} ${d.currency} (authorization ${d.authId}).`); db.saveDeal(d); s.json(d);
}));
app.post('/api/deals/:id/mock-fund', wrap(async (q, s) => { // only for demo without PayPal keys
  const d = load(q, s); if (!d) return; if (pp.live()) return s.status(400).json({ error: 'Use PayPal checkout.' });
  d.authId = 'MOCK-AUTH-' + d.id; d.status = 'FUNDED'; log(d, `Simulated PayPal hold of ${d.amount} ${d.currency}.`); db.saveDeal(d); s.json(d);
}));

// --- Seller proof ---
app.post('/api/deals/:id/proof', wrap(async (q, s) => {
  const d = load(q, s); if (!d) return; if (d.status !== 'FUNDED') return s.status(400).json({ error: 'Deal is not funded yet.' });
  d.proofImage = q.body.image || null; d.sellerStatement = q.body.statement || ''; d.status = 'DELIVERED';
  log(d, 'Seller delivered and uploaded proof.'); db.saveDeal(d); s.json(d);
}));

// --- AI verdict, then PayPal moves the money ---
app.post('/api/deals/:id/judge', wrap(async (q, s) => {
  const d = load(q, s); if (!d) return; if (d.status !== 'DELIVERED') return s.status(400).json({ error: 'Waiting for seller proof.' });
  d.buyerStatement = q.body.buyerStatement || d.buyerStatement || '';
  log(d, 'AI judge is reviewing the proof and both statements.');
  d.verdict = await ai.judge(d);
  if (d.verdict.decision === 'release') { d.captureId = await pp.capture(d); d.status = 'RELEASED'; db.bump(d.sellerHandle, d.sellerName, 'safe'); log(d, 'AI verdict: RELEASE. PayPal paid the seller.'); }
  else { await pp.void(d); d.status = 'REFUNDED'; db.bump(d.sellerHandle, d.sellerName, 'scams'); log(d, 'AI verdict: REFUND. PayPal returned the money to the buyer.'); }
  db.saveDeal(d); s.json(d);
}));

// --- Scam Radar ---
app.post('/api/radar', wrap(async (q, s) => {
  if (!q.body.text || q.body.text.length < 5) return s.status(400).json({ error: 'Paste the listing or chat first.' });
  const handle = q.body.sellerHandle ? slug(q.body.sellerHandle) : null;
  s.json(await ai.radar({ text: q.body.text, badge: handle && db.getSeller(handle) }));
}));

// --- Trust Badge ---
app.get('/api/sellers/:h', (q, s) => { const r = db.getSeller(q.params.h) || { handle: q.params.h, name: q.params.h, safe: 0, scams: 0 }; s.json({ ...r, badgeUrl: `${BASE()}/badge/${r.handle}.svg`, pageUrl: `${BASE()}/#/seller/${r.handle}` }); });
app.get('/api/leaderboard', (q, s) => s.json(db.leaderboard()));
app.get('/badge/:h.svg', (q, s) => {
  const r = db.getSeller(q.params.h) || { name: q.params.h, safe: 0, scams: 0 };
  const esc = x => String(x).replace(/[<>&"]/g, '');
  s.type('image/svg+xml').send(`<svg xmlns="http://www.w3.org/2000/svg" width="320" height="84" viewBox="0 0 320 84"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#22d3ee"/><stop offset="1" stop-color="#8b5cf6"/></linearGradient></defs><rect width="320" height="84" rx="16" fill="#0b1020"/><rect x="1.5" y="1.5" width="317" height="81" rx="14.5" fill="none" stroke="url(#g)" stroke-width="2"/><circle cx="42" cy="42" r="22" fill="url(#g)"/><path d="M31 43l8 8 15-17" fill="none" stroke="#0b1020" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><text x="78" y="36" font-family="Arial,sans-serif" font-size="17" font-weight="700" fill="#fff">${esc(r.name)}</text><text x="78" y="58" font-family="Arial,sans-serif" font-size="13" fill="#7dd3fc">${r.safe} safe deals · ${r.scams} scams</text><text x="296" y="74" text-anchor="end" font-family="Arial,sans-serif" font-size="9" fill="#64748b">Handshake</text></svg>`);
});

// --- One-click demo scenarios (always use simulated hold so the demo never fails) ---
app.post('/api/demo/:sc', wrap(async (q, s) => {
  const honest = q.params.sc === 'honest';
  const d = await createDeal(honest ? { title: 'Vintage toy car', description: 'Red die-cast toy car, boxed, excellent condition', amount: 25, sellerName: 'Rahul Verma', buyerName: 'Asha' }
    : { title: 'Limited sneakers', description: 'Size 9 sneakers, brand new in box', amount: 80, sellerName: 'Sketchy Steve', buyerName: 'Asha' });
  d.authId = 'MOCK-AUTH-' + d.id; d.status = 'DELIVERED'; log(d, 'Simulated PayPal hold (demo mode).');
  d.sellerStatement = honest ? 'Handed over the boxed toy car in person. Photo attached shows it in the buyer\'s hands.' : 'Shipped yesterday, trust me. No photo, the courier lost the receipt.';
  d.buyerStatement = honest ? 'Received it. Looks exactly like the listing, all good.' : 'Nothing has arrived and the seller will not show any proof.';
  d.demo = true; log(d, 'Seller delivered and uploaded proof.'); db.saveDeal(d); s.json(d);
}));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`\n  Handshake running at http://localhost:${port}\n  PayPal: ${pp.live() ? 'LIVE keys (' + (process.env.PAYPAL_MODE || 'sandbox') + ')' : 'MOCK mode (no keys)'}  |  AI: ${ai.live() ? 'Claude' : 'offline heuristics (no key)'}\n`));
