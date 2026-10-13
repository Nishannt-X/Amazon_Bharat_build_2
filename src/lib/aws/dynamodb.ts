import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { awsCredentialsAvailable } from "./runtime";

let docClientInstance: DynamoDBDocumentClient | null = null;

export function getDynamoClient(): DynamoDBClient | null {
  const region = process.env.AWS_REGION || "ap-southeast-2";

  if (!awsCredentialsAvailable()) return null;

  return new DynamoDBClient({
    region,
  });
}

export function getDynamoDocClient(): DynamoDBDocumentClient | null {
  if (docClientInstance) return docClientInstance;
  const client = getDynamoClient();
  if (!client) return null;
  docClientInstance = DynamoDBDocumentClient.from(client, {
    marshallOptions: {
      removeUndefinedValues: true,
    },
  });
  return docClientInstance;
}

export const DYNAMO_TABLES = {
  reports: () => process.env.DYNAMODB_REPORTS_TABLE || "floodflow_reports",
  reportsArchive: () => process.env.DYNAMODB_REPORTS_ARCHIVE_TABLE || "floodflow_reports_archive",
  accounts: () => process.env.DYNAMODB_ACCOUNTS_TABLE || "floodflow_accounts",
  sessions: () => process.env.DYNAMODB_SESSIONS_TABLE || "floodflow_sessions",
  garage: () => process.env.DYNAMODB_GARAGE_TABLE || "floodflow_garage",
  analyses: () => process.env.DYNAMODB_ANALYSES_TABLE || "floodflow_analyses",
};

export function isDynamoConfigured(): boolean {
  return awsCredentialsAvailable();
}
