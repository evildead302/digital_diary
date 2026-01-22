// /api/expenses.js - ONLY GET QUERY UPDATED
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

  try {
    switch (req.method) {
      case 'GET':
        console.log(`Fetching expenses for user ${userId}`);
        try {
          const expenses = await sql`
            SELECT 
              id, 
              TO_CHAR(date, 'DD-MM-YYYY') as date,  -- CHANGED: Format as DD-MM-YYYY
              description, 
              amount, 
              main_category, 
              sub_category,
              deleted,
              created_at,
              updated_at
            FROM expenses 
            WHERE user_id = ${userId} AND deleted = false
            ORDER BY date DESC  -- Note: Still ordering by original date column
            LIMIT 1000
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

      case 'POST':
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
              inserted: 0,
              updated: 0 
            });
          }

          let inserted = 0;
          let updated = 0;
          let errors = [];

          for (const expense of expenses) {
            try {
              // Validate expense data
              if (!expense.id || !expense.date || expense.amount === undefined) {
                errors.push({ id: expense.id, error: 'Missing required fields' });
                continue;
              }

              // Check if expense exists
              const existing = await sql`
                SELECT id FROM expenses 
                WHERE id = ${expense.id} AND user_id = ${userId}
              `;

              if (existing.length > 0) {
                // Update existing expense
                await sql`
                  UPDATE expenses SET
                    date = ${expense.date},
                    description = ${expense.desc || expense.description || ''},
                    amount = ${parseFloat(expense.amount)},
                    main_category = ${expense.main || expense.main_category || ''},
                    sub_category = ${expense.sub || expense.sub_category || ''},
                    updated_at = NOW(),
                    deleted = ${expense.syncRemarks === 'deleted' || false}
                  WHERE id = ${expense.id} AND user_id = ${userId}
                `;
                updated++;
                console.log(`Updated expense ${expense.id} for user ${userId}`);
              } else {
                // Insert new expense
                await sql`
                  INSERT INTO expenses (
                    id, user_id, date, description, amount, 
                    main_category, sub_category, created_at
                  ) VALUES (
                    ${expense.id}, 
                    ${userId}, 
                    ${expense.date}, 
                    ${expense.desc || expense.description || ''},
                    ${parseFloat(expense.amount)}, 
                    ${expense.main || expense.main_category || ''}, 
                    ${expense.sub || expense.sub_category || ''}, 
                    NOW()
                  )
                `;
                inserted++;
                console.log(`Inserted expense ${expense.id} for user ${userId}`);
              }
            } catch (dbError) {
              console.error(`Error processing expense ${expense.id}:`, dbError);
              errors.push({ 
                id: expense.id, 
                error: dbError.message 
              });
            }
          }

          return res.json({
            success: true,
            message: `Sync complete: ${inserted} inserted, ${updated} updated`,
            inserted,
            updated,
            errors: errors.length > 0 ? errors : undefined
          });

        } catch (error) {
          console.error('Sync POST error:', error);
          return res.status(500).json({ 
            success: false, 
            message: 'Database error during sync',
            error: error.message 
          });
        }

      case 'DELETE':
        try {
          const { id } = req.query;
          if (!id) {
            return res.status(400).json({ 
              success: false, 
              message: 'Expense ID required' 
            });
          }

          await sql`
            UPDATE expenses 
            SET deleted = true, updated_at = NOW() 
            WHERE id = ${id} AND user_id = ${userId}
          `;

          return res.json({ 
            success: true, 
            message: 'Expense marked as deleted' 
          });
        } catch (error) {
          console.error('Delete error:', error);
          return res.status(500).json({ 
            success: false, 
            message: 'Failed to delete expense',
            error: error.message 
          });
        }

      default:
        return res.status(405).json({ 
          success: false, 
          message: 'Method not allowed' 
        });
    }
  } catch (error) {
    console.error('General API error:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Internal server error',
      error: error.message 
    });
  }
}
