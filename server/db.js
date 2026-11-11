const Database = require('better-sqlite3');
const fs = require('fs'), path = require('path');
const dir = path.join(__dirname, '..', 'data');
fs.mkdirSync(dir, { recursive: true });
const db = new Database(path.join(dir, 'handshake.db'));
db.exec(`CREATE TABLE IF NOT EXISTS deals(id TEXT PRIMARY KEY, data TEXT NOT NULL, created INTEGER);
CREATE TABLE IF NOT EXISTS sellers(handle TEXT PRIMARY KEY, name TEXT, safe INTEGER DEFAULT 0, scams INTEGER DEFAULT 0);`);
module.exports = {
  getDeal: id => { const r = db.prepare('SELECT data FROM deals WHERE id=?').get(id); return r && JSON.parse(r.data); },
  saveDeal: d => db.prepare('INSERT OR REPLACE INTO deals(id,data,created) VALUES(?,?,?)').run(d.id, JSON.stringify(d), d.created),
  listDeals: () => db.prepare('SELECT data FROM deals ORDER BY created DESC LIMIT 50').all().map(r => JSON.parse(r.data)),
  getSeller: h => db.prepare('SELECT * FROM sellers WHERE handle=?').get(h),
  bump: (handle, name, field) => {
    db.prepare('INSERT OR IGNORE INTO sellers(handle,name) VALUES(?,?)').run(handle, name);
    db.prepare(`UPDATE sellers SET ${field === 'safe' ? 'safe' : 'scams'}=${field === 'safe' ? 'safe' : 'scams'}+1 WHERE handle=?`).run(handle);
  },
  leaderboard: () => db.prepare('SELECT * FROM sellers ORDER BY safe DESC, scams ASC LIMIT 10').all(),
};
