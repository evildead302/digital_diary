// /api/backup.js - TEMPORARY TEST VERSION (NO AUTH)
//   ⚠️ Anyone can call this. Restore the protected version immediately after testing.
import { neon } from '@neondatabase/serverless';
import zlib from 'zlib';
import { putObject, listKeys, deleteObject } from './_r2.js';

const sql = neon(process.env.DATABASE_URL);
const run = (text) => (typeof sql.query === 'function' ? sql.query(text) : sql(text));

const TABLES = (process.env.BACKUP_TABLES || 'expenses,budgets').split(',').map(s => s.trim()).filter(Boolean);
const KEEP_DAYS = parseInt(process.env.BACKUP_KEEP_DAYS || '30', 10);
const TZ = process.env.BACKUP_TZ || 'Asia/Karachi';
const ROWS_PER_INSERT = 500;

function lit(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number' || typeof v === 'bigint') return String(v);
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (v instanceof Date) return `'${v.toISOString()}'`;
  if (typeof v === 'object') return `'${JSON.stringify(v).replace(/'/g, "''")}'`;
  return `'${String(v).replace(/'/g, "''")}'`;
}

export default async function handler(req, res) {
  // ⚠️ AUTH CHECK REMOVED FOR TESTING

  const started = Date.now();
  try {
    const day = new Date().toLocaleDateString('en-CA', { timeZone: TZ });
    const lines = [
      '-- Accounts Diary database backup',
      `-- backup date: ${day} (${TZ})   created: ${new Date().toISOString()}`,
      ''
    ];
    const counts = {};

    for (const table of TABLES) {
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(table)) continue;
      let rows;
      try {
        rows = await run(`SELECT * FROM "${table}"`);
      } catch (e) {
        lines.push(`-- table "${table}" skipped: ${e.message}`, '');
        console.log(`Backup: table ${table} skipped:`, e.message);
        continue;
      }
      counts[table] = rows.length;
      lines.push(`-- table: ${table}  (${rows.length} rows)`);

      if (rows.length > 0) {
        const cols = Object.keys(rows[0]);
        const colList = cols.map(c => `"${c}"`).join(', ');
        for (let i = 0; i < rows.length; i += ROWS_PER_INSERT) {
          const chunk = rows.slice(i, i + ROWS_PER_INSERT);
          lines.push(
            `INSERT INTO "${table}" (${colList}) VALUES\n` +
            chunk.map(r => '(' + cols.map(c => lit(r[c])).join(', ') + ')').join(',\n') + ';'
          );
        }
      }
      lines.push('');
    }

    const gz = zlib.gzipSync(Buffer.from(lines.join('\n'), 'utf8'));
    const key = `backups/daily/${day}.sql.gz`;
    await putObject(key, gz, 'application/gzip');

    const deleted = [];
    if (KEEP_DAYS > 0) {
      const cutoff = new Date(Date.now() - KEEP_DAYS * 86400000).toLocaleDateString('en-CA', { timeZone: TZ });
      for (const k of await listKeys('backups/daily/')) {
        const m = k.match(/(\d{4}-\d{2}-\d{2})\.sql\.gz$/);
        if (m && m[1] < cutoff) { await deleteObject(k); deleted.push(k); }
      }
    }

    console.log('Backup done:', { key, bytes: gz.length, counts, deleted: deleted.length, ms: Date.now() - started });
    return res.json({
      success: true,
      key,
      bytes: gz.length,
      tables: counts,
      deletedOldBackups: deleted,
      ms: Date.now() - started
    });
  } catch (error) {
    console.error('Backup failed:', error);
    return res.status(500).json({ success: false, message: 'Backup failed', error: error.message });
  }
}
