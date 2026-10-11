import { DynamoDBClient, CreateTableCommand, DescribeTableCommand, UpdateTimeToLiveCommand } from "@aws-sdk/client-dynamodb";
import { readFileSync } from "node:fs";

// Load .env.local
const envContent = readFileSync(".env.local", "utf8");
for (const line of envContent.split("\n")) {
  const match = line.match(/^\s*([\w]+)\s*=\s*(.*?)\s*$/);
  if (match && !process.env[match[1]]) {
    process.env[match[1]] = match[2];
  }
}

const region = process.env.AWS_REGION || "ap-southeast-2";
const client = new DynamoDBClient({ region });

const tables = [
  {
    TableName: process.env.DYNAMODB_REPORTS_TABLE || "floodflow_reports",
    KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
    AttributeDefinitions: [
      { AttributeName: "id", AttributeType: "S" },
      { AttributeName: "publicationStatus", AttributeType: "S" },
      { AttributeName: "reportedAt", AttributeType: "S" }
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: "PublicationStatusIndex",
        KeySchema: [
          { AttributeName: "publicationStatus", KeyType: "HASH" },
          { AttributeName: "reportedAt", KeyType: "RANGE" }
        ],
        Projection: { ProjectionType: "ALL" }
      }
    ],
    BillingMode: "PAY_PER_REQUEST"
  },
  {
    TableName: process.env.DYNAMODB_ACCOUNTS_TABLE || "floodflow_accounts",
    KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
    AttributeDefinitions: [
      { AttributeName: "id", AttributeType: "S" },
      { AttributeName: "email", AttributeType: "S" }
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: "EmailIndex",
        KeySchema: [{ AttributeName: "email", KeyType: "HASH" }],
        Projection: { ProjectionType: "ALL" }
      }
    ],
    BillingMode: "PAY_PER_REQUEST"
  },
  {
    TableName: process.env.DYNAMODB_SESSIONS_TABLE || "floodflow_sessions",
    KeySchema: [{ AttributeName: "token_hash", KeyType: "HASH" }],
    AttributeDefinitions: [{ AttributeName: "token_hash", AttributeType: "S" }],
    BillingMode: "PAY_PER_REQUEST",
    ttlAttribute: "expires_at_epoch"
  },
  {
    TableName: process.env.DYNAMODB_GARAGE_TABLE || "floodflow_garage",
    KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
    AttributeDefinitions: [
      { AttributeName: "id", AttributeType: "S" },
      { AttributeName: "account_id", AttributeType: "S" }
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: "AccountIndex",
        KeySchema: [{ AttributeName: "account_id", KeyType: "HASH" }],
        Projection: { ProjectionType: "ALL" }
      }
    ],
    BillingMode: "PAY_PER_REQUEST"
  },
  {
    TableName: process.env.DYNAMODB_ANALYSES_TABLE || "floodflow_analyses",
    KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
    AttributeDefinitions: [
      { AttributeName: "id", AttributeType: "S" },
      { AttributeName: "owner", AttributeType: "S" }
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: "OwnerIndex",
        KeySchema: [{ AttributeName: "owner", KeyType: "HASH" }],
        Projection: { ProjectionType: "ALL" }
      }
    ],
    BillingMode: "PAY_PER_REQUEST",
    ttlAttribute: "expires_at_epoch"
  }
];

async function ensureTable(def) {
  const { ttlAttribute, ...tableParams } = def;
  try {
    const desc = await client.send(new DescribeTableCommand({ TableName: def.TableName }));
    console.log(`Table ${def.TableName} already exists (Status: ${desc.Table.TableStatus})`);
  } catch (err) {
    if (err.name === "ResourceNotFoundException") {
      console.log(`Creating table ${def.TableName}...`);
      await client.send(new CreateTableCommand(tableParams));
      console.log(`Requested creation for ${def.TableName}`);
    } else {
      throw err;
    }
  }

  // Wait until active
  let active = false;
  while (!active) {
    const desc = await client.send(new DescribeTableCommand({ TableName: def.TableName }));
    if (desc.Table?.TableStatus === "ACTIVE") {
      active = true;
      console.log(`✓ Table ${def.TableName} is ACTIVE.`);
    } else {
      process.stdout.write(".");
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  if (ttlAttribute) {
    try {
      await client.send(new UpdateTimeToLiveCommand({
        TableName: def.TableName,
        TimeToLiveSpecification: {
          Enabled: true,
          AttributeName: ttlAttribute
        }
      }));
      console.log(`✓ TTL enabled on ${def.TableName} (${ttlAttribute})`);
    } catch (e) {
      // TTL might already be enabled or updating
    }
  }
}

async function run() {
  console.log(`Provisioning DynamoDB tables in region: ${region}`);
  for (const table of tables) {
    await ensureTable(table);
  }
  console.log("All DynamoDB tables ready in AWS!");
}

run().catch(e => {
  console.error("Provisioning failed:", e);
  process.exit(1);
});
