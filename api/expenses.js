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
    return null;
  }
}

export default async function handler(req, res) {
  const user = authenticateToken(req);
  if (!user) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  const userId = user.userId;

  switch (req.method) {
    case 'GET':
      try {
        const expenses = await sql`
          SELECT * FROM expenses 
          WHERE user_id = ${userId} AND deleted = false
          ORDER BY date DESC
          LIMIT 1000
        `;
        return res.json({ success: true, expenses });
      } catch (error) {
        console.error('Get expenses error:', error);
        return res.status(500).json({ success: false, message: 'Failed to fetch expenses' });
      }

    case 'POST':
      try {
        const { expenses } = req.body;
        
        if (!expenses || !Array.isArray(expenses)) {
          return res.status(400).json({ success: false, message: 'Invalid data' });
        }

        let inserted = 0;
        let updated = 0;

        for (const expense of expenses) {
          try {
            const exists = await sql`
              SELECT id FROM expenses WHERE id = ${expense.id} AND user_id = ${userId}
            `;

            if (exists.length > 0) {
              // Update existing
              await sql`
                UPDATE expenses SET
                  date = ${expense.date},
                  description = ${expense.desc},
                  amount = ${expense.amount},
                  main_category = ${expense.main},
                  sub_category = ${expense.sub},
                  updated_at = NOW()
                WHERE id = ${expense.id} AND user_id = ${userId}
              `;
              updated++;
            } else {
              // Insert new
              await sql`
                INSERT INTO expenses (
                  id, user_id, date, description, amount, 
                  main_category, sub_category, created_at
                ) VALUES (
                  ${expense.id}, ${userId}, ${expense.date}, ${expense.desc},
                  ${expense.amount}, ${expense.main}, ${expense.sub}, NOW()
                )
              `;
              inserted++;
            }
          } catch (error) {
            console.error('Error processing expense:', expense.id, error);
          }
        }

        return res.json({
          success: true,
          message: `Sync complete: ${inserted} inserted, ${updated} updated`
        });

      } catch (error) {
        console.error('Sync error:', error);
        return res.status(500).json({ success: false, message: 'Sync failed' });
      }

    case 'DELETE':
      try {
        const { id } = req.query;
        if (!id) {
          return res.status(400).json({ success: false, message: 'Expense ID required' });
        }

        await sql`
          UPDATE expenses 
          SET deleted = true, updated_at = NOW() 
          WHERE id = ${id} AND user_id = ${userId}
        `;

        return res.json({ success: true, message: 'Expense deleted' });
      } catch (error) {
        console.error('Delete error:', error);
        return res.status(500).json({ success: false, message: 'Failed to delete expense' });
      }

    default:
      return res.status(405).json({ success: false, message: 'Method not allowed' });
  }
}
