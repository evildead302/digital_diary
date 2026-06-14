// /api/expenses.js - UPDATED with permanent deletion and optimized batch processing
import { neon } from '@neondatabase/serverless';
import jwt from 'jsonwebtoken';

const sql = neon(process.env.DATABASE_URL);
const JWT_SECRET = process.env.JWT_SECRET;

function authenticateToken(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    console.log("No authorization header");
    return null;
  }

  const token = authHeader.split(' ')[1];
  if (!token) {
    console.log("No token in header");
    return null;
  }

  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    console.log("Token verification failed:", error.message);
    return null;
  }
}

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Handle OPTIONS request for CORS
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Authenticate
  const user = authenticateToken(req);
  if (!user) {
    console.log("Authentication failed");
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  const userId = user.userId;
  console.log(`API call by user ${userId}, method: ${req.method}`);

  // GET - Fetch expenses
  if (req.method === 'GET') {
    console.log(`Fetching expenses for user ${userId}`);
    try {
      const expenses = await sql`
        SELECT 
          id, 
          TO_CHAR(date, 'DD-MM-YYYY') as date,
          description, 
          amount, 
          main_category, 
          sub_category,
          created_at,
          updated_at
        FROM expenses 
        WHERE user_id = ${userId}
        ORDER BY date DESC
      `;
      console.log(`Found ${expenses.length} expenses for user ${userId}`);
      return res.json({ 
        success: true, 
        expenses,
        count: expenses.length 
      });
    } catch (error) {
      console.error('Get expenses database error:', error);
      return res.status(500).json({ 
        success: false, 
        message: 'Database error fetching expenses',
        error: error.message 
      });
    }
  }

  // POST - Sync expenses
  if (req.method === 'POST') {
    try {
      const { expenses } = req.body;
      
      console.log(`Syncing ${expenses?.length || 0} expenses for user ${userId}`);
      
      if (!expenses || !Array.isArray(expenses)) {
        console.log('Invalid data format:', req.body);
        return res.status(400).json({ 
          success: false, 
          message: 'Invalid data format. Expected {expenses: array}' 
        });
      }

      if (expenses.length === 0) {
        return res.json({ 
          success: true, 
          message: 'No expenses to sync',
          successes: [],
          inserted: 0,
          updated: 0 
        });
      }

      // Process in chunks to avoid timeout
      const CHUNK_SIZE = 20;
      let successes = [];
      let errors = [];
      let insertedCount = 0;
      let updatedCount = 0;

      // Process expenses in smaller chunks
      for (let i = 0; i < expenses.length; i += CHUNK_SIZE) {
        const chunk = expenses.slice(i, i + CHUNK_SIZE);
        
        // Process all expenses in chunk with UPSERT (replaces separate insert/update)
        const upsertPromises = chunk.map(expense => {
          let dbDate;
          try {
            const [day, month, year] = expense.date.split('-');
            dbDate = `${year}-${month}-${day}`;
          } catch (dateError) {
            dbDate = expense.date;
          }

          return sql`
            INSERT INTO expenses (id, user_id, date, description, amount, main_category, sub_category, created_at, updated_at)
            VALUES (
              ${expense.id}, 
              ${userId}, 
              ${dbDate}, 
              ${expense.description || expense.desc || ''},
              ${parseFloat(expense.amount)}, 
              ${expense.main_category || expense.main || ''}, 
              ${expense.sub_category || expense.sub || ''}, 
              COALESCE(${expense.created_at}, NOW()),
              NOW()
            )
            ON CONFLICT (id) DO UPDATE SET
              user_id = EXCLUDED.user_id,
              date = EXCLUDED.date,
              description = EXCLUDED.description,
              amount = EXCLUDED.amount,
              main_category = EXCLUDED.main_category,
              sub_category = EXCLUDED.sub_category,
              updated_at = NOW()
          `;
        });

        try {
          await Promise.all(upsertPromises);
          const processedCount = chunk.length;
          successes.push(...chunk.map(e => e.id));
          // Count based on syncRemarks from frontend
          const newCount = chunk.filter(e => e.syncRemarks === 'new').length;
          const editedCount = chunk.filter(e => e.syncRemarks === 'edited').length;
          insertedCount += newCount;
          updatedCount += editedCount;
          console.log(`Upserted ${processedCount} expenses in chunk (${newCount} new, ${editedCount} edited)`);
        } catch (error) {
          console.error('Batch upsert error:', error);
          // Fallback to sequential upserts
          for (const expense of chunk) {
            try {
              let dbDate;
              try {
                const [day, month, year] = expense.date.split('-');
                dbDate = `${year}-${month}-${day}`;
              } catch (dateError) {
                dbDate = expense.date;
              }

              await sql`
                INSERT INTO expenses (id, user_id, date, description, amount, main_category, sub_category, created_at, updated_at)
                VALUES (${expense.id}, ${userId}, ${dbDate}, ${expense.description || expense.desc || ''},
                        ${parseFloat(expense.amount)}, ${expense.main_category || expense.main || ''},
                        ${expense.sub_category || expense.sub || ''}, COALESCE(${expense.created_at}, NOW()), NOW())
                ON CONFLICT (id) DO UPDATE SET
                  user_id = EXCLUDED.user_id,
                  date = EXCLUDED.date,
                  description = EXCLUDED.description,
                  amount = EXCLUDED.amount,
                  main_category = EXCLUDED.main_category,
                  sub_category = EXCLUDED.sub_category,
                  updated_at = NOW()
              `;
              successes.push(expense.id);
              if (expense.syncRemarks === 'new') {
                insertedCount++;
              } else {
                updatedCount++;
              }
            } catch (err) {
              errors.push({ id: expense.id, error: err.message });
            }
          }
        }

        console.log(`Completed chunk ${Math.floor(i/CHUNK_SIZE) + 1}/${Math.ceil(expenses.length/CHUNK_SIZE)}`);
      }

      if (errors.length > 0) {
        return res.json({
          success: true,
          message: `Partial sync: ${successes.length} processed, ${errors.length} failed`,
          successes,
          errors,
          inserted: insertedCount,
          updated: updatedCount
        });
      } else {
        return res.json({
          success: true,
          message: `Sync complete: ${successes.length} processed successfully`,
          successes,
          inserted: insertedCount,
          updated: updatedCount
        });
      }

    } catch (error) {
      console.error('Sync POST error:', error);
      return res.status(500).json({ 
        success: false, 
        message: 'Database error during sync',
        error: error.message 
      });
    }
  }

  // DELETE - Remove expense
  if (req.method === 'DELETE') {
    try {
      const { id } = req.query;
      if (!id) {
        return res.status(400).json({ 
          success: false, 
          message: 'Expense ID required' 
        });
      }

      // PERMANENT DELETE
      await sql`
        DELETE FROM expenses 
        WHERE id = ${id} AND user_id = ${userId}
      `;

      return res.json({ 
        success: true, 
        message: 'Expense permanently deleted' 
      });
    } catch (error) {
      console.error('Delete error:', error);
      return res.status(500).json({ 
        success: false, 
        message: 'Failed to delete expense',
        error: error.message 
      });
    }
  }

  // Method not allowed
  return res.status(405).json({ 
    success: false, 
    message: 'Method not allowed' 
  });
}