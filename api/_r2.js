// /api/_r2.js - Cloudflare R2 helper (S3-compatible). Files starting with "_" are NOT public API routes on Vercel.
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

let client = null;

function r2() {
  if (!client) {
    const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY } = process.env;
    if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !process.env.R2_BUCKET) {
      throw new Error('R2 environment variables are missing');
    }
    client = new S3Client({
      region: 'auto',
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY }
    });
  }
  return client;
}

// content type -> file extension (only these are accepted)
export const ALLOWED_TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf'
};

// A user may only touch keys like  proofs/<theirUserId>/<name>.<ext>
export function isValidKeyForUser(key, userId) {
  if (typeof key !== 'string') return false;
  const prefix = `proofs/${userId}/`;
  if (!key.startsWith(prefix)) return false;
  return /^[A-Za-z0-9_-]{1,80}\.(jpg|png|webp|pdf)$/.test(key.slice(prefix.length));
}

export async function putProof(key, body, contentType) {
  await r2().send(new PutObjectCommand({
    Bucket: process.env.R2_BUCKET, Key: key, Body: body, ContentType: contentType
  }));
}

export async function signedGetUrl(key, seconds = 600) {
  return getSignedUrl(r2(), new GetObjectCommand({ Bucket: process.env.R2_BUCKET, Key: key }), { expiresIn: seconds });
}

export async function deleteProof(key) {
  await r2().send(new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET, Key: key }));
}
