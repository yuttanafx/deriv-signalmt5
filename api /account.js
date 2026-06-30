// api/account.js
// EA push สถานะบัญชี/positions เข้ามาที่นี่ (POST) ทุก 5-10 วินาที
// หน้าเว็บ (dashboard) อ่านสถานะล่าสุดออกไป (GET)
// ใช้ Neon Postgres (DATABASE_URL จาก Vercel)

import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);
const API_KEY = process.env.EA_API_KEY;

async function ensureTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS account_status (
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
    const rows = await sql`SELECT data, updated_at FROM account_status WHERE id = 1`;
    if (rows.length === 0) return res.status(200).json({ account: null, positions: [] });
    return res.status(200).json({ ...rows[0].data, updatedAt: Number(rows[0].updated_at) });
  }

  if (req.method === 'POST') {
    const key = req.headers['x-api-key'];
    if (API_KEY && key !== API_KEY) return res.status(401).json({ error: 'invalid api key' });

    const { account, positions } = req.body || {};
    if (!account) return res.status(400).json({ error: 'account ข้อมูลจำเป็นต้องระบุ' });

    const data = { account, positions: positions || [] };
    const updatedAt = Date.now();
    await sql`
      INSERT INTO account_status (id, data, updated_at)
      VALUES (1, ${JSON.stringify(data)}::jsonb, ${updatedAt})
      ON CONFLICT (id) DO UPDATE SET data = ${JSON.stringify(data)}::jsonb, updated_at = ${updatedAt}
    `;
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'method not allowed' });
}
