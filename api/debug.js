// api/debug.js
export default function handler(req, res) {
  console.log('=== DEBUG ENVIRONMENT VARIABLES ===');
  console.log('DATABASE_URL value:', process.env.DATABASE_URL);
  console.log('DATABASE_URL type:', typeof process.env.DATABASE_URL);
  console.log('Raw DATABASE_URL (JSON):', JSON.stringify(process.env.DATABASE_URL));
  
  if (process.env.DATABASE_URL) {
    console.log('Contains "psql":', process.env.DATABASE_URL.includes('psql'));
    console.log('Starts with "psql":', process.env.DATABASE_URL.startsWith('psql'));
    console.log('Length:', process.env.DATABASE_URL.length);
  }
  
  return res.json({
    success: true,
    environment: {
      DATABASE_URL: process.env.DATABASE_URL,
      DATABASE_URL_startsWith_psql: process.env.DATABASE_URL?.startsWith('psql'),
      DATABASE_URL_contains_psql: process.env.DATABASE_URL?.includes('psql'),
      DATABASE_URL_length: process.env.DATABASE_URL?.length,
      NODE_ENV: process.env.NODE_ENV,
      VERCEL_ENV: process.env.VERCEL_ENV,
      VERCEL_URL: process.env.VERCEL_URL
    },
    timestamp: new Date().toISOString()
  });
}
