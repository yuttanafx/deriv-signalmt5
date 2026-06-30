import { neon } from '@neondatabase/serverless';

// ป้องกันระบบพังหากลืมตั้งค่า Environment Variable
const databaseUrl = process.env.DATABASE_URL;
const API_KEY = process.env.EA_API_KEY;

let sql;
if (databaseUrl) {
  sql = neon(databaseUrl);
}

async function ensureTable() {
  if (!sql) throw new Error('DATABASE_URL is missing in Vercel Environment Variables');
  await sql`
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      side TEXT NOT NULL,
      symbol TEXT NOT NULL,
      lot DOUBLE PRECISION NOT NULL,
      sl DOUBLE PRECISION,
      tp DOUBLE PRECISION,
      strategy TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      ticket TEXT,
      error TEXT,
      created_at BIGINT NOT NULL
    )
  `;
}

export default async function handler(req, res) {
  // ตั้งค่า CORS เพื่อให้ EA และอุปกรณ์อื่นๆ ยิงเข้ามารับส่งข้อมูลได้
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');
  
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    await ensureTable();

    // 1. รับคำสั่ง GET
    if (req.method === 'GET') {
      const rows = await sql`SELECT * FROM orders ORDER BY created_at DESC LIMIT 100`;
      const orders = rows.map(r => ({
        id: r.id, side: r.side, symbol: r.symbol, lot: r.lot,
        sl: r.sl, tp: r.tp, strategy: r.strategy, status: r.status,
        ticket: r.ticket, error: r.error, createdAt: Number(r.created_at),
      }));
      return res.status(200).json({ orders });
    }

    // 2. รับคำสั่ง POST
    if (req.method === 'POST') {
      const { side, symbol, lot, sl, tp, strategy } = req.body || {};
      if (!side || !symbol || !lot) {
        return res.status(400).json({ error: 'side, symbol, lot จำเป็นต้องระบุ' });
      }
      const id = Date.now().toString() + Math.random().toString(36).slice(2, 7);
      const createdAt = Date.now();
      await sql`
        INSERT INTO orders (id, side, symbol, lot, sl, tp, strategy, status, created_at)
        VALUES (${id}, ${String(side).toUpperCase()}, ${symbol}, ${Number(lot)}, ${sl ?? null}, ${tp ?? null}, ${strategy || ''}, 'pending', ${createdAt})
      `;
      return res.status(200).json({ ok: true, order: { id, side, symbol, lot, sl, tp, strategy, status: 'pending', createdAt } });
    }

    // 3. รับคำสั่ง PATCH
    if (req.method === 'PATCH') {
      const key = req.headers['x-api-key'];
      if (API_KEY && key !== API_KEY) return res.status(401).json({ error: 'invalid api key' });

      const { id, status, ticket, error } = req.body || {};
      if (!id) return res.status(400).json({ error: 'id จำเป็นต้องระบุ' });

      await sql`
        UPDATE orders SET
          status = COALESCE(${status}, status),
          ticket = COALESCE(${ticket}, ticket),
          error = COALESCE(${error}, error)
        WHERE id = ${id}
      `;
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'method not allowed' });

  } catch (error) {
    // หากโค้ดด้านในล่ม ให้พิมพ์สาเหตุออกมาดูแทนการปล่อยให้หน้าเว็บขึ้น 500 เปล่าๆ
    return res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
}
