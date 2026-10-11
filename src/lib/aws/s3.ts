import fs from 'node:fs';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';

function getS3Client(): S3Client | null {
  const region = process.env.S3_REGION || process.env.AWS_REGION || 'ap-southeast-2';
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

  if (!accessKeyId || !secretAccessKey) {
    return null;
  }

  return new S3Client({
    region,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });
}

export function getS3BucketName(): string | null {
  return process.env.S3_EVIDENCE_BUCKET || process.env.NEXT_PUBLIC_S3_BUCKET || null;
}

/**
 * Uploads a flood photo or voice recording to Amazon S3.
 * Returns the S3 key if successful, or null on failure (triggering local fallback).
 */
export async function uploadEvidenceToS3(
  key: string,
  body: Uint8Array | Buffer,
  contentType: string,
  metadata?: Record<string, string>
): Promise<string | null> {
  const client = getS3Client();
  const bucket = getS3BucketName();

  if (!client || !bucket) return null;

  try {
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        Metadata: metadata,
      })
    );
    return key;
  } catch (err) {
    console.warn('[AWS S3] Upload fallback to local storage:', (err as Error).message);
    return null;
  }
}

/**
 * Fetches an evidence image from Amazon S3.
 */
export async function getEvidenceFromS3(key: string): Promise<{ bytes: Uint8Array; contentType?: string } | null> {
  const client = getS3Client();
  const bucket = getS3BucketName();

  if (!client || !bucket) return null;

  try {
    const response = await client.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      })
    );

    if (!response.Body) return null;
    const byteArray = await response.Body.transformToByteArray();
    return {
      bytes: byteArray,
      contentType: response.ContentType,
    };
  } catch (err) {
    console.warn('[AWS S3] Fetch error:', (err as Error).message);
    return null;
  }
}

/**
 * Backs up the local SQLite database files to the S3 evidence bucket for cloud persistence.
 */
export async function backupDatabaseToS3(): Promise<boolean> {
  const client = getS3Client();
  const bucket = getS3BucketName();
  if (!client || !bucket) return false;

  const path = await import('node:path');
  const dir = process.env.REPORT_STORE_DIR?.trim() || path.join(process.cwd(), '.data', 'reports');

  const files = ['waterlogs.sqlite', 'accounts.sqlite', 'analyses.sqlite'];
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.existsSync(fullPath)) {
      try {
        const bytes = fs.readFileSync(fullPath);
        await uploadEvidenceToS3(`backups/${file}`, bytes, 'application/x-sqlite3', {
          backupTimestamp: new Date().toISOString()
        });
      } catch (err) {
        console.warn('[AWS S3 Backup] Failed for ' + file + ':', (err as Error).message);
      }
    }
  }
  return true;
}
