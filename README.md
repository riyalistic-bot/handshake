# Handshake: AI-judged escrow on PayPal (PayPal AI Hackathon)

PayPal holds the money. AI decides who is right. Three features, one loop:
- **Scam Radar** warns the buyer before paying (green / yellow / red).
- **Handshake** escrow: PayPal holds funds, AI judges the seller's proof, PayPal pays the seller or refunds the buyer.
- **Trust Badge** rewards honest sellers with a public, shareable badge and a leaderboard.

## Install first
1. **Node.js 18 or newer** (https://nodejs.org, pick LTS). Check with `node -v`.
2. That's it. SQLite is bundled via npm.

## The 3 steps
1. `cd handshake && npm install`
2. Copy `.env.example` to `.env` and paste your keys (see `GUIDE_API_KEYS.md`).
   - Windows: `copy .env.example .env`   Mac/Linux: `cp .env.example .env`
3. `npm start`, then open http://localhost:3000

No keys yet? It still runs: PayPal is simulated and the AI uses simple offline rules. The top-right pills show **mock/offline** (yellow) or **sandbox/Claude** (green).

## Demo in 30 seconds
On the home page click **Honest seller gets paid**, then **Ask AI to judge**. Repeat with **Cheater gets caught**. See `DEMO_SCRIPT.md` for the 3-minute pitch.

## Structure
```
server/index.js   API routes + escrow flow     server/paypal.js  PayPal authorize/capture/void
server/ai.js      Claude: rules, radar, judge  server/db.js      SQLite (data/handshake.db)
public/           UI (index.html, style.css, app.js)
```
## Notes
- Demo buttons always use a simulated hold so the demo never fails; the manual "New deal" flow uses real PayPal sandbox when keys are set.
- PayPal authorizations are held about 29 days (3-day honor period), enough for this use case.
- Sandbox only. Going live needs a PayPal business review and a real dispute/legal process.
