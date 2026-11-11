// PayPal escrow = AUTHORIZE (hold funds) -> CAPTURE (pay seller) or VOID (refund buyer).
// With no PayPal keys in .env the app runs in MOCK mode so you can still demo everything.
const live = () => !!(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET);
const host = () => process.env.PAYPAL_MODE === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
const cur = () => process.env.CURRENCY || 'USD';
async function token() {
  const r = await fetch(host() + '/v1/oauth2/token', { method: 'POST',
    headers: { Authorization: 'Basic ' + Buffer.from(process.env.PAYPAL_CLIENT_ID + ':' + process.env.PAYPAL_CLIENT_SECRET).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials' });
  const j = await r.json(); if (!r.ok) throw new Error('PayPal auth failed: ' + (j.error_description || r.status)); return j.access_token;
}
async function api(p, body) {
  const r = await fetch(host() + p, { method: 'POST',
    headers: { Authorization: 'Bearer ' + await token(), 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j = {}; try { j = JSON.parse(t); } catch {}
  if (!r.ok) throw new Error('PayPal: ' + (j.details?.[0]?.description || j.message || r.status));
  return j;
}
module.exports = {
  live,
  // STEP 1: create an order with intent AUTHORIZE (money is NOT moved yet)
  async createOrder(d) {
    const pu = { reference_id: d.id, custom_id: d.id, description: d.title.slice(0, 120), amount: { currency_code: cur(), value: Number(d.amount).toFixed(2) } };
    if (d.sellerEmail) pu.payee = { email_address: d.sellerEmail };
    const o = await api('/v2/checkout/orders', { intent: 'AUTHORIZE', purchase_units: [pu] });
    return o.id;
  },
  // STEP 2: after the buyer approves, authorize -> PayPal now HOLDS the funds
  async authorize(orderId) {
    const a = await api(`/v2/checkout/orders/${orderId}/authorize`, {});
    return a.purchase_units[0].payments.authorizations[0].id;
  },
  // STEP 3a: AI says RELEASE -> capture = money goes to the seller
  async capture(d) {
    if (!live() || String(d.authId).startsWith('MOCK')) return 'MOCK-CAPTURE-' + Date.now();
    return (await api(`/v2/payments/authorizations/${d.authId}/capture`, { final_capture: true })).id;
  },
  // STEP 3b: AI says REFUND -> void = hold is released back to the buyer
  async void(d) {
    if (!live() || String(d.authId).startsWith('MOCK')) return 'MOCK-VOID-' + Date.now();
    await api(`/v2/payments/authorizations/${d.authId}/void`); return 'VOIDED';
  },
};
