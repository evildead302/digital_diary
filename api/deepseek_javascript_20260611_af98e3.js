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
        successes: [],
        inserted: 0,
        updated: 0 
      });
    }

    // Process in chunks to avoid overwhelming the database
    const CHUNK_SIZE = 25;
    let allSuccesses = [];
    let allErrors = [];
    let totalInserted = 0;
    let totalUpdated = 0;

    // Function to process a chunk of expenses
    async function processChunk(chunk) {
      const chunkSuccesses = [];
      const chunkErrors = [];
      let chunkInserted = 0;
      let chunkUpdated = 0;

      // Get all existing IDs in one query
      const ids = chunk.map(e => e.id);
      const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');
      
      let existingIds = new Set();
      try {
        const existingRecords = await sql`
          SELECT id FROM expenses 
          WHERE id IN (${sql(ids)}) AND user_id = ${userId}
        `;
        existingIds = new Set(existingRecords.map(r => r.id));
      } catch (error) {
        console.error('Error checking existing records:', error);
      }

      // Separate inserts and updates
      const toInsert = chunk.filter(e => !existingIds.has(e.id));
      const toUpdate = chunk.filter(e => existingIds.has(e.id));

      // BULK INSERT - Single query for all new records
      if (toInsert.length > 0) {
        try {
          const insertValues = toInsert.map(expense => {
            // Parse date from DD-MM-YYYY to YYYY-MM-DD
            let dbDate;
            try {
              const [day, month, year] = expense.date.split('-');
              dbDate = `${year}-${month}-${day}`;
            } catch (dateError) {
              dbDate = expense.date;
            }

            return sql`
              (${expense.id}, ${userId}, ${dbDate}, ${expense.description || expense.desc || ''}, 
               ${parseFloat(expense.amount)}, ${expense.main_category || expense.main || ''}, 
               ${expense.sub_category || expense.sub || ''}, NOW())
            `;
          });

          // Execute all inserts in parallel
          await Promise.all(insertValues.map(v => v.execute()));
          chunkInserted = toInsert.length;
          chunkSuccesses.push(...toInsert.map(e => e.id));
          console.log(`Bulk inserted ${toInsert.length} records`);
        } catch (error) {
          console.error('Bulk insert error:', error);
          // Fallback to individual inserts if bulk fails
          for (const expense of toInsert) {
            try {
              let dbDate;
              try {
                const [day, month, year] = expense.date.split('-');
                dbDate = `${year}-${month}-${day}`;
              } catch (dateError) {
                dbDate = expense.date;
              }

              await sql`
                INSERT INTO expenses (
                  id, user_id, date, description, amount, 
                  main_category, sub_category, created_at
                ) VALUES (
                  ${expense.id}, ${userId}, ${dbDate}, 
                  ${expense.description || expense.desc || ''},
                  ${parseFloat(expense.amount)}, 
                  ${expense.main_category || expense.main || ''}, 
                  ${expense.sub_category || expense.sub || ''}, 
                  NOW()
                )
              `;
              chunkInserted++;
              chunkSuccesses.push(expense.id);
            } catch (err) {
              chunkErrors.push({ id: expense.id, error: err.message });
            }
          }
        }
      }

      // BULK UPDATE - Update all existing records
      if (toUpdate.length > 0) {
        try {
          // Process updates in parallel (but limited to avoid overwhelming)
          const updatePromises = toUpdate.map(expense => {
            let dbDate;
            try {
              const [day, month, year] = expense.date.split('-');
              dbDate = `${year}-${month}-${day}`;
            } catch (dateError) {
              dbDate = expense.date;
            }

            return sql`
              UPDATE expenses SET
                date = ${dbDate},
                description = ${expense.description || expense.desc || ''},
                amount = ${parseFloat(expense.amount)},
                main_category = ${expense.main_category || expense.main || ''},
                sub_category = ${expense.sub_category || expense.sub || ''},
                updated_at = NOW()
              WHERE id = ${expense.id} AND user_id = ${userId}
            `;
          });

          // Execute updates in parallel batches
          const BATCH_SIZE = 10;
          for (let i = 0; i < updatePromises.length; i += BATCH_SIZE) {
            const batch = updatePromises.slice(i, i + BATCH_SIZE);
            await Promise.all(batch.map(p => p.execute()));
          }
          
          chunkUpdated = toUpdate.length;
          chunkSuccesses.push(...toUpdate.map(e => e.id));
          console.log(`Updated ${toUpdate.length} records`);
        } catch (error) {
          console.error('Bulk update error:', error);
          // Fallback to individual updates
          for (const expense of toUpdate) {
            try {
              let dbDate;
              try {
                const [day, month, year] = expense.date.split('-');
                dbDate = `${year}-${month}-${day}`;
              } catch (dateError) {
                dbDate = expense.date;
              }

              await sql`
                UPDATE expenses SET
                  date = ${dbDate},
                  description = ${expense.description || expense.desc || ''},
                  amount = ${parseFloat(expense.amount)},
                  main_category = ${expense.main_category || expense.main || ''},
                  sub_category = ${expense.sub_category || expense.sub || ''},
                  updated_at = NOW()
                WHERE id = ${expense.id} AND user_id = ${userId}
              `;
              chunkUpdated++;
              chunkSuccesses.push(expense.id);
            } catch (err) {
              chunkErrors.push({ id: expense.id, error: err.message });
            }
          }
        }
      }

      return {
        successes: chunkSuccesses,
        errors: chunkErrors,
        inserted: chunkInserted,
        updated: chunkUpdated
      };
    }

    // Process expenses in chunks
    for (let i = 0; i < expenses.length; i += CHUNK_SIZE) {
      const chunk = expenses.slice(i, i + CHUNK_SIZE);
      const result = await processChunk(chunk);
      allSuccesses.push(...result.successes);
      allErrors.push(...result.errors);
      totalInserted += result.inserted;
      totalUpdated += result.updated;
      
      console.log(`Processed chunk ${Math.floor(i/CHUNK_SIZE) + 1}/${Math.ceil(expenses.length/CHUNK_SIZE)}`);
    }

    // Return response
    if (allErrors.length > 0) {
      return res.json({
        success: true,
        message: `Partial sync: ${allSuccesses.length} processed, ${allErrors.length} failed`,
        successes: allSuccesses,
        errors: allErrors,
        inserted: totalInserted,
        updated: totalUpdated
      });
    } else {
      return res.json({
        success: true,
        message: `Sync complete: ${allSuccesses.length} processed successfully`,
        successes: allSuccesses,
        inserted: totalInserted,
        updated: totalUpdated
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