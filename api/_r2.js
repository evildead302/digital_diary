// /api/_r2.js - Cloudflare R2 helper (S3-compatible). Files starting with "_" are NOT public API routes on Vercel.
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

let client = null;

function r2() {
  if (!client) {
    const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } = process.env;

    const missing = [];
    if (!R2_ACCOUNT_ID) missing.push('R2_ACCOUNT_ID');
    if (!R2_ACCESS_KEY_ID) missing.push('R2_ACCESS_KEY_ID');
    if (!R2_SECRET_ACCESS_KEY) missing.push('R2_SECRET_ACCESS_KEY');
    if (!R2_BUCKET) missing.push('R2_BUCKET');

    if (missing.length) {
      const err = new Error(`Missing env vars: ${missing.join(', ')}`);
      err.name = 'MissingEnvVars';
      console.error('R2 init failed:', err.message);
      throw err;
    }

    console.log('Initializing R2 client:', {
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      bucket: R2_BUCKET,
      keyIdPrefix: R2_ACCESS_KEY_ID.slice(0, 8) + '…'
    });

    client = new S3Client({
      region: 'auto',
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY
      }
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
  try {
    await r2().send(new PutObjectCommand({
      Bucket: process.env.R2_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType
    }));
    console.log('R2 PUT ok:', {
      key,
      size: body.length,
      bucket: process.env.R2_BUCKET,
      contentType
    });
  } catch (e) {
    console.error('R2 PUT failed:', {
      key,
      bucket: process.env.R2_BUCKET,
      size: body.length,
      contentType,
      name: e.name,
      message: e.message,
      code: e.Code || e.code,
      statusCode: e.$metadata?.httpStatusCode,
      requestId: e.$metadata?.requestId,
      attempts: e.$metadata?.attempts
    });
    throw e;
  }
}

export async function signedGetUrl(key, seconds = 600) {
  try {
    const url = await getSignedUrl(
      r2(),
      new GetObjectCommand({ Bucket: process.env.R2_BUCKET, Key: key }),
      { expiresIn: seconds }
    );
    console.log('R2 GET signed url ok:', { key, seconds });
    return url;
  } catch (e) {
    console.error('R2 GET signed url failed:', {
      key,
      name: e.name,
      message: e.message,
      statusCode: e.$metadata?.httpStatusCode
    });
    throw e;
  }
}

export async function deleteProof(key) {
  try {
    await r2().send(new DeleteObjectCommand({
      Bucket: process.env.R2_BUCKET,
      Key: key
    }));
    console.log('R2 DELETE ok:', { key, bucket: process.env.R2_BUCKET });
  } catch (e) {
    console.error('R2 DELETE failed:', {
      key,
      bucket: process.env.R2_BUCKET,
      name: e.name,
      message: e.message,
      statusCode: e.$metadata?.httpStatusCode
    });
    throw e;
  }
}


// ---------- generic helpers used by the daily backup (/api/backup) ----------
export async function putObject(key, body, contentType) {
  await r2().send(new PutObjectCommand({
    Bucket: process.env.R2_BUCKET, Key: key, Body: body, ContentType: contentType
  }));
  console.log('R2 PUT object ok:', { key, size: body.length });
}

export async function deleteObject(key) {
  await r2().send(new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET, Key: key }));
}

// all keys that start with prefix
export async function listKeys(prefix) {
  const keys = [];
  let token;
  do {
    const out = await r2().send(new ListObjectsV2Command({
      Bucket: process.env.R2_BUCKET, Prefix: prefix, ContinuationToken: token
    }));
    (out.Contents || []).forEach(o => keys.push(o.Key));
    token = out.IsTruncated ? out.NextContinuationToken : undefined;
  } while (token);
  return keys;
}
