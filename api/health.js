import { neon } from '@neondatabase/serverless';

// Clean up the DATABASE_URL if it has 'psql' prefix and quotes
let connectionString = process.env.DATABASE_URL;

// Remove 'psql' prefix and quotes if present
if (connectionString.startsWith('psql ')) {
  connectionString = connectionString.replace(/^psql\s+['"]?|['"]$/g, '');
}

const sql = neon(connectionString);

export default async function handler(req, res) {
  try {
    // Test database connection
    await sql`SELECT 1`;
    
    return res.json({
      success: true,
      message: 'API is healthy',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Health check failed:', error);
    return res.status(500).json({
      success: false,
      message: 'Database connection failed',
      error: error.message
    });
  }
}
