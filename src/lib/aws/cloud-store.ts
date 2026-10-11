import { GetCommand, PutCommand, QueryCommand, ScanCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";
import { getDynamoDocClient, DYNAMO_TABLES } from "./dynamodb";
import { uploadEvidenceToS3, getEvidenceFromS3 } from "./s3";
import type { SharedWaterlogReport } from "../report";

/**
 * Reads all shared flood reports from AWS DynamoDB.
 */
export const DEFAULT_REPORT_TTL_HOURS = 24;

/**
 * Calculates epoch seconds when a waterlogging report expires.
 * Baseline samples last 30 days; community reports expire after REPORT_TTL_HOURS (default 24h).
 */
export function computeReportTtlEpoch(reportedAt: string, isSample = false): number {
  const reportedEpoch = Math.floor(new Date(reportedAt).getTime() / 1000);
  if (isSample) {
    return reportedEpoch + (30 * 86400); // 30 days for benchmark samples
  }
  const hours = Number(process.env.REPORT_TTL_HOURS) || DEFAULT_REPORT_TTL_HOURS;
  return reportedEpoch + (hours * 3600);
}

export async function readReportsFromCloud(): Promise<SharedWaterlogReport[] | null> {
  const ddb = getDynamoDocClient();
  if (!ddb) return null;

  try {
    const res = await ddb.send(new ScanCommand({
      TableName: DYNAMO_TABLES.reports(),
    }));

    if (!res.Items || res.Items.length === 0) return [];
    
    const nowEpoch = Math.floor(Date.now() / 1000);

    return res.Items
      .filter(item => {
        // Expired reports naturally disappear from the active map
        if (item.expires_at_epoch && typeof item.expires_at_epoch === "number" && item.expires_at_epoch <= nowEpoch) {
          return false;
        }
        return true;
      })
      .map(item => {
      if (item.reportJson) {
        try { return JSON.parse(item.reportJson); } catch {}
      }
      return item as unknown as SharedWaterlogReport;
    }).sort((a, b) => new Date(a.reportedAt).getTime() - new Date(b.reportedAt).getTime());
  } catch (err) {
    console.warn("[AWS DynamoDB] readReports failed:", (err as Error).message);
    return null;
  }
}

/**
 * Saves a flood report to AWS DynamoDB and uploads evidence images to AWS S3.
 */
export async function saveReportToCloud(
  report: SharedWaterlogReport,
  photoBytes: Buffer | Uint8Array,
  baselineBytes?: Buffer | Uint8Array | null
): Promise<boolean> {
  const ddb = getDynamoDocClient();
  if (!ddb) return false;

  try {
    // 1. Upload photo to S3
    await uploadEvidenceToS3(`reports/${report.id}/photo.jpg`, photoBytes, "image/jpeg", {
      reportId: report.id,
      location: report.locationLabel,
    });

    // 2. Upload baseline to S3 if present
    if (baselineBytes) {
      await uploadEvidenceToS3(`reports/${report.id}/baseline.jpg`, baselineBytes, "image/jpeg", {
        reportId: report.id,
      });
    }

    // 3. Compute TTL epoch (expires after configured hours)
    const expiresAtEpoch = computeReportTtlEpoch(report.reportedAt, report.provenance === "sample");

    // 4. Put report document in DynamoDB with native TTL
    await ddb.send(new PutCommand({
      TableName: DYNAMO_TABLES.reports(),
      Item: {
        id: report.id,
        lat: report.lat,
        lng: report.lng,
        locationLabel: report.locationLabel,
        reportedAt: report.reportedAt,
        reportCount: report.reportCount ?? 1,
        observedDepthCm: report.observedDepthCm ?? null,
        verificationStatus: report.verificationStatus ?? "unverified",
        publicationStatus: report.publicationStatus ?? "pending",
        provenance: report.provenance ?? "community-gps",
        evidenceOwner: report.evidenceOwner ?? null,
        expires_at_epoch: expiresAtEpoch,
        reportJson: JSON.stringify({ ...report, expires_at_epoch: expiresAtEpoch }),
        ...report
      }
    }));

    return true;
  } catch (err) {
    console.warn("[AWS Cloud Store] saveReport failed:", (err as Error).message);
    return false;
  }
}

/**
 * Fetches a report's photo from Amazon S3.
 */
export async function getReportPhotoFromCloud(id: string): Promise<Uint8Array | null> {
  const file = await getEvidenceFromS3(`reports/${id}/photo.jpg`);
  return file?.bytes ?? null;
}

/**
 * Cloud Account Operations (DynamoDB)
 */
export interface CloudAccount {
  id: string;
  email: string;
  password_hash: string;
  salt: string;
  created_at: number;
}

export async function getAccountByEmailFromCloud(email: string): Promise<CloudAccount | null> {
  const ddb = getDynamoDocClient();
  if (!ddb) return null;

  try {
    const res = await ddb.send(new QueryCommand({
      TableName: DYNAMO_TABLES.accounts(),
      IndexName: "EmailIndex",
      KeyConditionExpression: "email = :email",
      ExpressionAttributeValues: { ":email": email.toLowerCase().trim() },
      Limit: 1
    }));
    return (res.Items?.[0] as CloudAccount) ?? null;
  } catch (err) {
    console.warn("[AWS DynamoDB] getAccountByEmail failed:", (err as Error).message);
    return null;
  }
}

export async function saveAccountToCloud(account: CloudAccount): Promise<boolean> {
  const ddb = getDynamoDocClient();
  if (!ddb) return false;

  try {
    await ddb.send(new PutCommand({
      TableName: DYNAMO_TABLES.accounts(),
      Item: account
    }));
    return true;
  } catch (err) {
    console.warn("[AWS DynamoDB] saveAccount failed:", (err as Error).message);
    return false;
  }
}

/**
 * Cloud Session Operations (DynamoDB with TTL)
 */
export async function saveSessionToCloud(tokenHash: string, accountId: string, expiresAt: number): Promise<boolean> {
  const ddb = getDynamoDocClient();
  if (!ddb) return false;

  try {
    await ddb.send(new PutCommand({
      TableName: DYNAMO_TABLES.sessions(),
      Item: {
        token_hash: tokenHash,
        account_id: accountId,
        expires_at: expiresAt,
        expires_at_epoch: Math.floor(expiresAt / 1000)
      }
    }));
    return true;
  } catch (err) {
    console.warn("[AWS DynamoDB] saveSession failed:", (err as Error).message);
    return false;
  }
}

export async function getSessionFromCloud(tokenHash: string): Promise<{ account_id: string; expires_at: number } | null> {
  const ddb = getDynamoDocClient();
  if (!ddb) return null;

  try {
    const res = await ddb.send(new GetCommand({
      TableName: DYNAMO_TABLES.sessions(),
      Key: { token_hash: tokenHash }
    }));
    if (!res.Item) return null;
    if (res.Item.expires_at <= Date.now()) return null;
    return { account_id: res.Item.account_id, expires_at: res.Item.expires_at };
  } catch (err) {
    console.warn("[AWS DynamoDB] getSession failed:", (err as Error).message);
    return null;
  }
}

export async function deleteSessionFromCloud(tokenHash: string): Promise<boolean> {
  const ddb = getDynamoDocClient();
  if (!ddb) return false;

  try {
    await ddb.send(new DeleteCommand({
      TableName: DYNAMO_TABLES.sessions(),
      Key: { token_hash: tokenHash }
    }));
    return true;
  } catch {
    return false;
  }
}

/**
 * Cloud Garage Operations
 */
export interface CloudGarageCar {
  id: string;
  account_id: string;
  vehicle_id: string;
  model_year: string;
  variant: string;
  created_at: number;
}

export async function getGarageFromCloud(accountId: string): Promise<CloudGarageCar[]> {
  const ddb = getDynamoDocClient();
  if (!ddb) return [];

  try {
    const res = await ddb.send(new QueryCommand({
      TableName: DYNAMO_TABLES.garage(),
      IndexName: "AccountIndex",
      KeyConditionExpression: "account_id = :acc",
      ExpressionAttributeValues: { ":acc": accountId }
    }));
    return (res.Items as CloudGarageCar[]) ?? [];
  } catch (err) {
    console.warn("[AWS DynamoDB] getGarage failed:", (err as Error).message);
    return [];
  }
}

export async function addGarageCarToCloud(car: CloudGarageCar): Promise<boolean> {
  const ddb = getDynamoDocClient();
  if (!ddb) return false;

  try {
    await ddb.send(new PutCommand({
      TableName: DYNAMO_TABLES.garage(),
      Item: car
    }));
    return true;
  } catch (err) {
    console.warn("[AWS DynamoDB] addGarageCar failed:", (err as Error).message);
    return false;
  }
}
