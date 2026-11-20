const express = require('express');
const mysql = require('mysql2/promise');
const { createClient } = require('redis');

const db = mysql.createPool({
  host: process.env.DB_HOST,       // nama service di compose, bukan localhost
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

const redis = createClient({ url: `redis://${process.env.REDIS_HOST}:6379` });
redis.connect();

const app = express();

// tiap request: simpan 1 baris, kembalikan total
app.get('/', async (req, res) => {
  await db.query('CREATE TABLE IF NOT EXISTS hits (id INT AUTO_INCREMENT PRIMARY KEY, at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)');
  await db.query('INSERT INTO hits () VALUES ()');
  const [[{ total }]] = await db.query('SELECT COUNT(*) AS total FROM hits');
  res.json({ message: 'Hello from Node + MySQL', total });
});

// rate limit: 1 request / 2 detik per IP.
// SET NX PX atomic: key sukses dibuat = lolos, key masih ada = ditolak.
app.get('/limited', async (req, res) => {
  const key = `rl:${req.ip}`;
  const ok = await redis.set(key, '1', { NX: true, PX: 2000 });
  if (ok) return res.json({ message: 'allowed' });
  const ms = await redis.pTTL(key);
  res.set('Retry-After', Math.ceil(ms / 1000)).status(429).json({ message: 'too many requests', retry_after_ms: ms });
});

app.listen(3000, () => console.log('listening on :3000'));
