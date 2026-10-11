import Database from "better-sqlite3";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

// Load .env.local
const envContent = readFileSync(".env.local", "utf8");
for (const line of envContent.split("\n")) {
  const match = line.match(/^\s*([\w]+)\s*=\s*(.*?)\s*$/);
  if (match && !process.env[match[1]]) {
    process.env[match[1]] = match[2];
  }
}

const region = process.env.AWS_REGION || "ap-southeast-2";
const ddbClient = new DynamoDBClient({ region });
const ddbDoc = DynamoDBDocumentClient.from(ddbClient);
const s3Client = new S3Client({ region: process.env.S3_REGION || region });

const bucket = process.env.S3_EVIDENCE_BUCKET;
const reportsDir = path.join(process.cwd(), ".data", "reports");

async function migrateReports() {
  const file = path.join(reportsDir, "waterlogs.sqlite");
  if (!existsSync(file)) return console.log("No waterlogs.sqlite found.");
  const db = new Database(file);
  const rows = db.prepare("SELECT id, metadata, photo, baseline FROM reports").all();
  console.log(`Migrating ${rows.length} reports to DynamoDB & S3...`);

  const tableName = process.env.DYNAMODB_REPORTS_TABLE || "floodflow_reports";

  for (const row of rows) {
    const report = JSON.parse(row.metadata);

    // Upload photo to S3
    if (bucket && row.photo) {
      try {
        await s3Client.send(new PutObjectCommand({
          Bucket: bucket,
          Key: `reports/${row.id}/photo.jpg`,
          Body: row.photo,
          ContentType: "image/jpeg"
        }));
        report.s3PhotoKey = `reports/${row.id}/photo.jpg`;
      } catch (err) {
        console.warn(`Failed S3 photo upload for ${row.id}:`, err.message);
      }
    }

    if (bucket && row.baseline) {
      try {
        await s3Client.send(new PutObjectCommand({
          Bucket: bucket,
          Key: `reports/${row.id}/baseline.jpg`,
          Body: row.baseline,
          ContentType: "image/jpeg"
        }));
        report.s3BaselineKey = `reports/${row.id}/baseline.jpg`;
      } catch (err) {
        console.warn(`Failed S3 baseline upload for ${row.id}:`, err.message);
      }
    }

    // Save report document in DynamoDB
    await ddbDoc.send(new PutCommand({
      TableName: tableName,
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
        reportJson: JSON.stringify(report),
        ...report
      }
    }));
  }
  console.log(`✓ Migrated ${rows.length} reports.`);
}

async function migrateAccounts() {
  const file = path.join(reportsDir, "accounts.sqlite");
  if (!existsSync(file)) return console.log("No accounts.sqlite found.");
  const db = new Database(file);
  
  // Accounts
  const accounts = db.prepare("SELECT id, email, password_hash, salt, created_at FROM accounts").all();
  console.log(`Migrating ${accounts.length} accounts to DynamoDB...`);
  const accountsTable = process.env.DYNAMODB_ACCOUNTS_TABLE || "floodflow_accounts";
  for (const acc of accounts) {
    await ddbDoc.send(new PutCommand({
      TableName: accountsTable,
      Item: acc
    }));
  }
  console.log(`✓ Migrated ${accounts.length} accounts.`);

  // Garage
  const garage = db.prepare("SELECT id, account_id, vehicle_id, model_year, variant, created_at FROM garage").all();
  console.log(`Migrating ${garage.length} garage cars to DynamoDB...`);
  const garageTable = process.env.DYNAMODB_GARAGE_TABLE || "floodflow_garage";
  for (const car of garage) {
    await ddbDoc.send(new PutCommand({
      TableName: garageTable,
      Item: car
    }));
  }
  console.log(`✓ Migrated ${garage.length} garage items.`);
}

async function migrateAnalyses() {
  const file = path.join(reportsDir, "analyses.sqlite");
  if (!existsSync(file)) return console.log("No analyses.sqlite found.");
  const db = new Database(file);
  const rows = db.prepare("SELECT id, owner, created_at, result, photo_result FROM analyses").all();
  console.log(`Migrating ${rows.length} analyses to DynamoDB...`);
  const analysesTable = process.env.DYNAMODB_ANALYSES_TABLE || "floodflow_analyses";
  for (const row of rows) {
    await ddbDoc.send(new PutCommand({
      TableName: analysesTable,
      Item: {
        id: row.id,
        owner: row.owner,
        result: row.result,
        photo_result: row.photo_result,
        createdAt: row.created_at,
        expires_at_epoch: Math.floor((Date.now() + 7 * 86400000) / 1000)
      }
    }));
  }
  console.log(`✓ Migrated ${rows.length} analyses.`);
}

async function run() {
  console.log("Starting data migration from SQLite to AWS DynamoDB & S3...");
  await migrateReports();
  await migrateAccounts();
  await migrateAnalyses();
  console.log("Migration complete!");
}

run().catch(e => {
  console.error("Migration failed:", e);
  process.exit(1);
});
