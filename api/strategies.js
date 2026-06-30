// api/strategies.js
// EA คำนวณคะแนนแต่ละกลยุทธ์แล้ว POST เข้ามาเก็บที่นี่ทุก ๆ N วินาที
// Dashboard อ่านออกไปแสดงเป็นการ์ด Strategy Intelligence
// ใช้ Neon Postgres (DATABASE_URL จาก Vercel)

import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);
const API_KEY = process.env.EA_API_KEY;

async function ensureTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS strategy_status (
      id INT PRIMARY KEY DEFAULT 1,
      data JSONB NOT NULL,
      updated_at BIGINT NOT NULL
    )
  `;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');
  if (req.method === 'OPTIONS') return res.status(200).end();

  await ensureTable();

  if (req.method === 'GET') {
    const rows = await sql`SELECT data, updated_at FROM strategy_status WHERE id = 1`;
    if (rows.length === 0) return res.status(200).json({ strategies: [], updatedAt: null });
    return res.status(200).json({ strategies: rows[0].data.strategies || [], updatedAt: Number(rows[0].updated_at) });
  }

  if (req.method === 'POST') {
    const key = req.headers['x-api-key'];
    if (API_KEY && key !== API_KEY) return res.status(401).json({ error: 'invalid api key' });

    const { strategies } = req.body || {};
    if (!Array.isArray(strategies)) {
      return res.status(400).json({ error: 'strategies ต้องเป็น array' });
    }
    const data = { strategies };
    const updatedAt = Date.now();
    await sql`
      INSERT INTO strategy_status (id, data, updated_at)
      VALUES (1, ${JSON.stringify(data)}::jsonb, ${updatedAt})
      ON CONFLICT (id) DO UPDATE SET data = ${JSON.stringify(data)}::jsonb, updated_at = ${updatedAt}
    `;
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'method not allowed' });
}
