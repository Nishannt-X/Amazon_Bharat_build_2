import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

let docClientInstance: DynamoDBDocumentClient | null = null;

export function getDynamoClient(): DynamoDBClient | null {
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  const region = process.env.AWS_REGION || "ap-southeast-2";

  if (!accessKeyId || !secretAccessKey) return null;

  return new DynamoDBClient({
    region,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
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
  accounts: () => process.env.DYNAMODB_ACCOUNTS_TABLE || "floodflow_accounts",
  sessions: () => process.env.DYNAMODB_SESSIONS_TABLE || "floodflow_sessions",
  garage: () => process.env.DYNAMODB_GARAGE_TABLE || "floodflow_garage",
  analyses: () => process.env.DYNAMODB_ANALYSES_TABLE || "floodflow_analyses",
};

export function isDynamoConfigured(): boolean {
  return Boolean(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY);
}
