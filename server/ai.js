// All AI features (Claude). Falls back to simple heuristics if no ANTHROPIC_API_KEY is set.
const has = () => !!process.env.ANTHROPIC_API_KEY;
async function claude(system, content, max = 700) {
  const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST',
    headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6', max_tokens: max, system, messages: [{ role: 'user', content }] }) });
  const j = await r.json(); if (!r.ok) throw new Error('Claude API: ' + (j.error?.message || r.status));
  const m = j.content.map(c => c.text || '').join('').match(/\{[\s\S]*\}/);
  return JSON.parse(m[0]);
}
const ONLY = ' Reply with ONLY one JSON object, no markdown.';

exports.live = has;

// 1) Plain-language deal -> clear rules
exports.rules = async d => {
  if (has()) try {
    const j = await claude('You write fair, checkable escrow rules for a deal between two strangers.' + ONLY + ' Schema: {"rules":["3 to 5 short, verifiable rules"],"proof_required":"what photo/evidence the seller must upload"}',
      `Item: ${d.title}\nDetails: ${d.description}\nPrice: ${d.amount} ${process.env.CURRENCY || 'USD'}`, 500);
    return j;
  } catch (e) { console.error(e.message); }
  return { rules: [`Seller delivers: ${d.title}.`, 'Item matches the description in this deal.', 'Seller uploads a clear photo as proof of delivery.', 'Buyer confirms or disputes with an honest statement.'], proof_required: 'A clear photo showing the item delivered or handed over.' };
};

// 2) Scam Radar -> green / yellow / red
exports.radar = async ({ text, badge }) => {
  if (has()) try {
    return await claude('You are Scam Radar, a fraud detector for online peer-to-peer purchases. Check: price far too cheap, seller rushing/pressuring, seller refusing escrow/Handshake, payment outside the platform (gift cards, crypto, "friends & family"), no seller badge, vague or copied listing.' + ONLY + ' Schema: {"light":"green|yellow|red","reason":"ONE sentence","signals":["short flags found"]}',
      `Seller Handshake badge: ${badge ? `${badge.safe} safe deals, ${badge.scams} lost disputes` : 'none'}\n\nListing/chat:\n${text}`, 400);
  } catch (e) { console.error(e.message); }
  const t = text.toLowerCase(), s = [];
  if (/only one left|pay now|hurry|urgent|last chance|right now/.test(t)) s.push('Seller is rushing you');
  if (/no escrow|don'?t want|friends and family|gift card|crypto|western union|outside/.test(t)) s.push('Seller avoids safe payment');
  if (/too good|90% off|dirt cheap|half price/.test(t)) s.push('Price looks too cheap');
  if (!badge) s.push('Seller has no Handshake badge');
  const light = s.length >= 3 ? 'red' : s.length >= 1 ? 'yellow' : 'green';
  return { light, reason: s.length ? s.join('; ') + '.' : 'No obvious scam signs found.', signals: s };
};

// 3) The judge: reads rules + proof (image) + both statements -> release / refund
exports.judge = async d => {
  if (has()) try {
    const parts = [];
    if (d.proofImage) { const m = d.proofImage.match(/^data:(image\/[\w+.-]+);base64,(.+)$/); if (m) parts.push({ type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } }); }
    parts.push({ type: 'text', text: `DEAL: ${d.title}\nDETAILS: ${d.description}\nRULES:\n- ${d.rules.join('\n- ')}\nPROOF REQUIRED: ${d.proofRequired}\n\nSELLER STATEMENT: ${d.sellerStatement || '(none)'}\nBUYER STATEMENT: ${d.buyerStatement || '(none)'}\n${d.proofImage ? 'The attached image is the seller\'s proof.' : 'The seller uploaded NO photo.'}` });
    return await claude('You are the neutral AI judge of a payment escrow. Decide if the seller fulfilled the deal. "release" pays the seller; "refund" returns money to the buyer. Weigh the proof image, the rules and both statements; a missing/irrelevant photo or a contradicted claim favours refund; a matching proof and no credible complaint favours release.' + ONLY + ' Schema: {"decision":"release|refund","confidence":0-100,"reason":"2 short sentences","evidence":["key observations"]}', parts, 600);
  } catch (e) { console.error(e.message); }
  const bad = /not |never|nothing|didn'?t|fake|empty|broken|wrong|scam|missing/i.test(d.buyerStatement || '');
  const refund = bad || (!d.proofImage && !d.sellerStatement);
  return { decision: refund ? 'refund' : 'release', confidence: 70, reason: refund ? 'Buyer disputes delivery and the proof does not back the seller up.' : 'Seller proof is on record and the buyer raised no credible complaint.', evidence: ['Offline heuristic judge (add ANTHROPIC_API_KEY for the real AI)'] };
};
