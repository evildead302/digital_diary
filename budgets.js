// /api/budgets.js - monthly budgets (one amount per category per month). Empty month = no row = no limit.
import { neon } from '@neondatabase/serverless';
import jwt from 'jsonwebtoken';

const sql = neon(process.env.DATABASE_URL);
const JWT_SECRET = process.env.JWT_SECRET;

function authenticateToken(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return null;
  const token = authHeader.split(' ')[1];
  if (!token) return null;
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    console.log('Token verification failed:', error.message);
    return null;
  }
}

export default async function handler(req, res) {
  // CORS (same as expenses.js)
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const user = authenticateToken(req);
  if (!user) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  const userId = user.userId;   // always taken from the token, never from the request body

  // GET - all budgets of this user
  if (req.method === 'GET') {
    try {
      const budgets = await sql`
        SELECT main_category, year, month, amount
        FROM budgets
        WHERE user_id = ${userId}
        ORDER BY year, month, main_category
      `;
      return res.json({ success: true, budgets, count: budgets.length });
    } catch (error) {
      console.error('Get budgets error:', error);
      return res.status(500).json({ success: false, message: 'Database error fetching budgets', error: error.message });
    }
  }

  // POST - replace ALL budgets of this user with the list sent by the app
  // body: { budgets: [ { main_category, year, month, amount }, ... ] }   (empty list = remove all limits)
  if (req.method === 'POST') {
    try {
      const { budgets } = req.body || {};
      if (!Array.isArray(budgets)) {
        return res.status(400).json({ success: false, message: 'Invalid data format. Expected {budgets: array}' });
      }
      if (budgets.length > 5000) {
        return res.status(400).json({ success: false, message: 'Too many budget rows' });
      }

      // validate + keep only usable rows (amount > 0); the last row wins for the same category/month
      const unique = new Map();
      for (const b of budgets) {
        const main = String(b.main_category || '').trim();
        const year = parseInt(b.year, 10);
        const month = parseInt(b.month, 10);
        const amount = parseFloat(b.amount);
        if (!main || main.length > 100) continue;
        if (!(year >= 2000 && year <= 2100) || !(month >= 1 && month <= 12)) continue;
        if (!(amount > 0)) continue;
        unique.set(`${main}|${year}|${month}`, { main_category: main, year, month, amount });
      }
      const rows = [...unique.values()];

      // delete + insert in ONE transaction, so a failure never leaves the user without budgets
      const statements = [sql`DELETE FROM budgets WHERE user_id = ${userId}`];
      if (rows.length > 0) {
        statements.push(sql`
          INSERT INTO budgets (user_id, main_category, year, month, amount)
          SELECT ${userId}, r.main_category, r.year, r.month, r.amount
          FROM jsonb_to_recordset(${JSON.stringify(rows)}::jsonb)
            AS r(main_category text, year int, month int, amount numeric)
        `);
      }
      await sql.transaction(statements);

      return res.json({ success: true, message: `Saved ${rows.length} budget rows`, saved: rows.length });
    } catch (error) {
      console.error('Save budgets error:', error);
      return res.status(500).json({ success: false, message: 'Database error saving budgets', error: error.message });
    }
  }

  return res.status(405).json({ success: false, message: 'Method not allowed' });
}
