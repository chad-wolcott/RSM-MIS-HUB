const { CosmosClient } = require('@azure/cosmos');

let client;
let database;

function getClient() {
  if (!client) {
    if (!process.env.COSMOS_ENDPOINT) throw new Error('COSMOS_ENDPOINT is not configured');
    if (!process.env.COSMOS_KEY) throw new Error('COSMOS_KEY is not configured');

    client = new CosmosClient({
      endpoint: process.env.COSMOS_ENDPOINT,
      key: process.env.COSMOS_KEY,
    });
    database = client.database(process.env.COSMOS_DATABASE || 'mih');
  }
  return { client, database };
}

function getContainer(name) {
  const { database } = getClient();
  return database.container(name);
}

/**
 * Ensures the database and all required containers exist.
 * Call once during startup or from a setup script.
 */
async function ensureInfrastructure() {
  const { client } = getClient();
  const dbName = process.env.COSMOS_DATABASE || 'mih';

  const { database } = await client.databases.createIfNotExists({ id: dbName });

  const containers = [
    { id: 'tenants',    partitionKey: { paths: ['/id'] } },
    { id: 'users',      partitionKey: { paths: ['/id'] } },
    { id: 'audit-logs', partitionKey: { paths: ['/date'] } },
    { id: 'config',     partitionKey: { paths: ['/category'] } },
  ];

  for (const spec of containers) {
    await database.containers.createIfNotExists(spec);
  }
}

module.exports = { getClient, getContainer, ensureInfrastructure };
