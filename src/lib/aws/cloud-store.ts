import { getDynamoDocClient, DYNAMO_TABLES } from "./dynamodb";
import { PutCommand, ScanCommand, GetCommand, DeleteCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { uploadEvidenceToS3, getEvidenceFromS3 } from "./s3";
import type { SharedWaterlogReport } from "../report";
import { distanceMeters } from "../report";

/**
 * Reads all shared flood reports from AWS DynamoDB.
 */
export const DEFAULT_REPORT_TTL_HOURS = 24;
export const DEFAULT_CLUSTER_RADIUS_METERS = 40;

/**
 * Calculates epoch seconds when a waterlogging report expires.
 * Baseline samples last 30 days; community reports expire after REPORT_TTL_HOURS (default 24h).
 */
/**
 * Checks whether a flood report has active TTL status (i.e. has not yet expired).
 */
export function isReportTtlActive(
  report: SharedWaterlogReport,
  nowEpoch: number = Math.floor(Date.now() / 1000)
): boolean {
  const exp = (report as { expires_at_epoch?: number }).expires_at_epoch;
  if (typeof exp === "number" && !isNaN(exp) && exp > 0) {
    return nowEpoch < exp;
  }
  const computedExp = computeReportTtlEpoch(report.reportedAt, report.provenance === "sample");
  return nowEpoch < computedExp;
}

export function computeReportTtlEpoch(reportedAt: string, isSample = false): number {
  const reportedEpoch = Math.floor(new Date(reportedAt).getTime() / 1000);
  if (isSample) {
    return reportedEpoch + (30 * 86400); // 30 days for benchmark samples
  }
  const hours = Number(process.env.REPORT_TTL_HOURS) || DEFAULT_REPORT_TTL_HOURS;
  return reportedEpoch + (hours * 3600);
}

/**
 * Reads all historical reports from AWS DynamoDB archive table (permanent store).
 */
export async function readArchivedReportsFromCloud(): Promise<SharedWaterlogReport[]> {
  const ddb = getDynamoDocClient();
  if (!ddb) return [];

  try {
    const res = await ddb.send(new ScanCommand({
      TableName: DYNAMO_TABLES.reportsArchive(),
    }));

    if (!res.Items || res.Items.length === 0) return [];

    return res.Items.map(item => {
      let parsed: SharedWaterlogReport;
      if (item.reportJson) {
        try {
          parsed = JSON.parse(item.reportJson);
        } catch {
          parsed = item as unknown as SharedWaterlogReport;
        }
      } else {
        parsed = item as unknown as SharedWaterlogReport;
      }
      return {
        ...parsed,
        publicationStatus: "public" as const,
      };
    }).sort((a, b) => new Date(b.reportedAt).getTime() - new Date(a.reportedAt).getTime());
  } catch (err) {
    console.warn("[AWS DynamoDB] readArchivedReports failed:", (err as Error).message);
    return [];
  }
}

/**
 * Proximity clustering logic (10m - 40m radius):
 * Clusters nearby active reports so they do not clutter the map as separate markers.
 * Forms a single consolidated pinger reflecting:
 * - activeReportsCount: count of currently active reports within radius
 * - pastReportsCount: count of expired/past reports within radius in the archive
 * - reportCount: total reports at this spot
 * - highest observed depth & latest model findings
 */
export function clusterWaterlogReports(
  rawActiveReports: SharedWaterlogReport[],
  archivedReports: SharedWaterlogReport[] = [],
  radiusMeters: number = Number(process.env.CLUSTER_RADIUS_METERS) || DEFAULT_CLUSTER_RADIUS_METERS
): SharedWaterlogReport[] {
  const nowEpoch = Math.floor(Date.now() / 1000);

  // Consolidate candidate pool ensuring any unexpired report is recognized
  const candidateMap = new Map<string, SharedWaterlogReport>();
  for (const r of rawActiveReports) {
    candidateMap.set(r.id, r);
  }
  for (const r of archivedReports) {
    if (!candidateMap.has(r.id)) {
      candidateMap.set(r.id, r);
    }
  }

  const allCandidates = Array.from(candidateMap.values());
  const activeReports = allCandidates
    .filter((r) => isReportTtlActive(r, nowEpoch))
    .sort((a, b) => new Date(b.reportedAt).getTime() - new Date(a.reportedAt).getTime());

  if (activeReports.length === 0) return [];

  const sorted = activeReports;

  interface Cluster {
    primary: SharedWaterlogReport;
    activeReports: SharedWaterlogReport[];
    pastReports: SharedWaterlogReport[];
    maxDepth: number;
  }

  const clusters: Cluster[] = [];

  for (const report of sorted) {
    const match = clusters.find(
      (c) => distanceMeters(c.primary, report) <= radiusMeters
    );

    const reportDepth = report.observedDepthCm ?? 0;

    if (match) {
      match.activeReports.push(report);
      if (reportDepth > match.maxDepth) {
        match.maxDepth = reportDepth;
      }
    } else {
      clusters.push({
        primary: { ...report },
        activeReports: [report],
        pastReports: [],
        maxDepth: reportDepth,
      });
    }
  }

  // Cross-reference with archived reports to find past expired reports at this spot
  for (const cluster of clusters) {
    const activeIds = new Set(cluster.activeReports.map((r) => r.id));
    for (const archived of archivedReports) {
      if (activeIds.has(archived.id)) continue;
      if (distanceMeters(cluster.primary, archived) <= radiusMeters) {
        if (!isReportTtlActive(archived, nowEpoch)) {
          cluster.pastReports.push(archived);
        }
      }
    }

    const activeCount = cluster.activeReports.length;
    const pastCount = cluster.pastReports.length;

    cluster.primary.activeReportsCount = activeCount;
    cluster.primary.pastReportsCount = pastCount;
    cluster.primary.reportCount = activeCount + pastCount;
    cluster.primary.observedDepthCm = cluster.maxDepth > 0 ? cluster.maxDepth : cluster.primary.observedDepthCm;
    cluster.primary.publicationStatus = "public";

    // If any report in cluster is community-gps, show as live community observation
    if (cluster.activeReports.some((r) => r.provenance === "community-gps")) {
      cluster.primary.provenance = "community-gps";
    }
  }

  return clusters.map((c) => c.primary);
}

export async function readReportsFromCloud(): Promise<SharedWaterlogReport[] | null> {
  const ddb = getDynamoDocClient();
  if (!ddb) return null;

  try {
    const [resActive, archived] = await Promise.all([
      ddb.send(new ScanCommand({ TableName: DYNAMO_TABLES.reports() })),
      readArchivedReportsFromCloud(),
    ]);

    if (!resActive.Items || resActive.Items.length === 0) return [];
    
    const nowEpoch = Math.floor(Date.now() / 1000);

    const activeList = resActive.Items
      .filter(item => {
        // Expired reports naturally recede from the active map via TTL
        if (item.expires_at_epoch && typeof item.expires_at_epoch === "number" && item.expires_at_epoch <= nowEpoch) {
          return false;
        }
        return true;
      })
      .map(item => {
        let parsed: SharedWaterlogReport;
        if (item.reportJson) {
          try {
            parsed = JSON.parse(item.reportJson);
          } catch {
            parsed = item as unknown as SharedWaterlogReport;
          }
        } else {
          parsed = item as unknown as SharedWaterlogReport;
        }
        return {
          ...parsed,
          publicationStatus: "public" as const,
        };
      });

    // Cluster active reports within 40m radius and attach active/past counts
    return clusterWaterlogReports(activeList, archived);
  } catch (err) {
    console.warn("[AWS DynamoDB] readReports failed:", (err as Error).message);
    return null;
  }
}

/**
 * Saves a flood report to AWS DynamoDB (both active table with TTL and permanent archive table)
 * and uploads evidence images to AWS S3.
 */
export async function saveReportToCloud(
  report: SharedWaterlogReport,
  photoBytes: Buffer | Uint8Array,
  baselineBytes?: Buffer | Uint8Array | null
): Promise<boolean> {
  const ddb = getDynamoDocClient();
  if (!ddb) return false;

  try {
    const s3PhotoKey = `reports/${report.id}/photo.jpg`;

    // 1. Upload photo to S3
    await uploadEvidenceToS3(s3PhotoKey, photoBytes, "image/jpeg", {
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

    const fullPublicReport: SharedWaterlogReport = {
      ...report,
      publicationStatus: "public" as const,
    };

    const ddbItem = {
      ...fullPublicReport,
      s3PhotoKey,
      expires_at_epoch: expiresAtEpoch,
      reportJson: JSON.stringify({ ...fullPublicReport, expires_at_epoch: expiresAtEpoch, s3PhotoKey }),
    };

    // 4. Save to active table with TTL
    await ddb.send(new PutCommand({
      TableName: DYNAMO_TABLES.reports(),
      Item: {
        ...ddbItem,
        expires_at_epoch: expiresAtEpoch,
      }
    }));

    // 5. Save permanently to archive table (without TTL deletion so all findings & history persist)
    await ddb.send(new PutCommand({
      TableName: DYNAMO_TABLES.reportsArchive(),
      Item: {
        ...ddbItem,
        archivedAt: new Date().toISOString(),
      }
    }));

    return true;
  } catch (err) {
    console.warn("[AWS Cloud Store] saveReport failed:", (err as Error).message);
    return false;
  }
}

/**
 * Fetches a report document from AWS DynamoDB (checking active table, then archive table).
 */
export async function getReportFromCloudById(id: string): Promise<SharedWaterlogReport | null> {
  const ddb = getDynamoDocClient();
  if (!ddb) return null;

  try {
    // 1. Try active reports table
    let res = await ddb.send(new GetCommand({
      TableName: DYNAMO_TABLES.reports(),
      Key: { id }
    }));

    // 2. If not found (e.g., TTL expired), check archive table
    if (!res.Item) {
      res = await ddb.send(new GetCommand({
        TableName: DYNAMO_TABLES.reportsArchive(),
        Key: { id }
      }));
    }

    if (!res.Item) return null;

    let parsed: SharedWaterlogReport;
    if (res.Item.reportJson) {
      try {
        parsed = JSON.parse(res.Item.reportJson);
      } catch {
        parsed = res.Item as unknown as SharedWaterlogReport;
      }
    } else {
      parsed = res.Item as unknown as SharedWaterlogReport;
    }

    return {
      ...parsed,
      publicationStatus: "public" as const,
    };
  } catch (err) {
    console.warn("[AWS DynamoDB] getReportFromCloudById failed:", (err as Error).message);
    return null;
  }
}

/**
 * Fetches a report photo from Amazon S3.
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
