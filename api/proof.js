// /api/proof.js - payment proof files in Cloudflare R2
//   POST   { key, contentType, data(base64) }  -> upload
//   GET    ?key=...                            -> temporary signed link to view the file
//   DELETE ?key=...                            -> remove the file
import jwt from 'jsonwebtoken';
import { ALLOWED_TYPES, isValidKeyForUser, putProof, signedGetUrl, deleteProof } from './_r2.js';

const JWT_SECRET = process.env.JWT_SECRET;
const MAX_BYTES = 3 * 1024 * 1024;   // 3 MB per file (Vercel request limit is 4.5 MB, base64 adds ~33%)

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
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,DELETE,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = authenticateToken(req);
  if (!user) return res.status(401).json({ success: false, message: 'Unauthorized' });
  const userId = user.userId;

  try {
    if (req.method === 'POST') {
      const { key, contentType, data } = req.body || {};
      if (!isValidKeyForUser(key, userId)) {
        return res.status(400).json({ success: false, message: 'Invalid file key' });
      }
      const ext = ALLOWED_TYPES[contentType];
      if (!ext || !key.endsWith(`.${ext}`)) {
        return res.status(400).json({ success: false, message: 'File type not allowed (use JPG, PNG, WEBP or PDF)' });
      }
      if (typeof data !== 'string' || data.length === 0) {
        return res.status(400).json({ success: false, message: 'No file data' });
      }
      const buffer = Buffer.from(data, 'base64');
      if (buffer.length === 0 || buffer.length > MAX_BYTES) {
        return res.status(400).json({ success: false, message: 'File is empty or larger than 3 MB' });
      }
      await putProof(key, buffer, contentType);
      return res.json({ success: true, key, size: buffer.length });
    }

    if (req.method === 'GET') {
      const { key } = req.query;
      if (!isValidKeyForUser(key, userId)) {
        return res.status(400).json({ success: false, message: 'Invalid file key' });
      }
      const url = await signedGetUrl(key, 600);     // link works for 10 minutes
      return res.json({ success: true, url });
    }

    if (req.method === 'DELETE') {
      const { key } = req.query;
      if (!isValidKeyForUser(key, userId)) {
        return res.status(400).json({ success: false, message: 'Invalid file key' });
      }
      await deleteProof(key);
      return res.json({ success: true });
    }

    return res.status(405).json({ success: false, message: 'Method not allowed' });
  } catch (error) {
    console.error('Proof API error:', error);
    return res.status(500).json({ success: false, message: 'Proof storage error', error: error.message });
  }
}
