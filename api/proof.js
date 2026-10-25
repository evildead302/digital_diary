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

  // Log what env vars the function can actually see (names only, no secrets)
  console.log('proof.js env check:', {
    hasJwt: !!JWT_SECRET,
    hasAccountId: !!process.env.R2_ACCOUNT_ID,
    hasKeyId: !!process.env.R2_ACCESS_KEY_ID,
    hasSecret: !!process.env.R2_SECRET_ACCESS_KEY,
    hasBucket: !!process.env.R2_BUCKET,
    bucketValue: process.env.R2_BUCKET || null,
    method: req.method
  });

  try {
    if (req.method === 'POST') {
      const { key, contentType, data } = req.body || {};
      console.log('POST /api/proof', {
        key,
        contentType,
        dataLength: typeof data === 'string' ? data.length : 0,
        userId
      });

      if (!isValidKeyForUser(key, userId)) {
        console.log('Invalid key:', { key, userId });
        return res.status(400).json({ success: false, message: 'Invalid file key', key, userId });
      }
      const ext = ALLOWED_TYPES[contentType];
      if (!ext || !key.endsWith(`.${ext}`)) {
        return res.status(400).json({ success: false, message: 'File type not allowed (use JPG, PNG, WEBP or PDF)', contentType, key });
      }
      if (typeof data !== 'string' || data.length === 0) {
        return res.status(400).json({ success: false, message: 'No file data' });
      }
      const buffer = Buffer.from(data, 'base64');
      if (buffer.length === 0 || buffer.length > MAX_BYTES) {
        return res.status(400).json({ success: false, message: 'File is empty or larger than 3 MB', size: buffer.length });
      }

      console.log('Calling putProof:', { key, size: buffer.length, contentType });
      await putProof(key, buffer, contentType);
      console.log('putProof succeeded:', key);

      return res.json({ success: true, key, size: buffer.length });
    }

    if (req.method === 'GET') {
      const { key } = req.query;
      if (!isValidKeyForUser(key, userId)) {
        return res.status(400).json({ success: false, message: 'Invalid file key' });
      }
      const url = await signedGetUrl(key, 600);
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
    // Print EVERYTHING so Vercel logs show the real cause
    console.error('Proof API error FULL:', {
      name: error.name,
      message: error.message,
      code: error.Code || error.code,
      statusCode: error.$metadata?.httpStatusCode,
      requestId: error.$metadata?.requestId,
      attempts: error.$metadata?.attempts,
      stack: error.stack,
      cause: error.cause ? String(error.cause) : null
    });

    return res.status(500).json({
      success: false,
      message: 'Proof storage error',
      error: error.message,
      errorName: error.name,
      errorCode: error.Code || error.code || null,
      httpStatus: error.$metadata?.httpStatusCode || null,
      requestId: error.$metadata?.requestId || null
    });
  }
}
