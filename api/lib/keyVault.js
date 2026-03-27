const { SecretClient } = require('@azure/keyvault-secrets');
const { DefaultAzureCredential } = require('@azure/identity');

let secretClient;

function getClient() {
  if (!secretClient) {
    const vaultUri = process.env.KEYVAULT_URI;
    if (!vaultUri) throw new Error('KEYVAULT_URI is not configured');
    secretClient = new SecretClient(vaultUri, new DefaultAzureCredential());
  }
  return secretClient;
}

/**
 * Retrieve a secret by name from Azure Key Vault.
 * Returns null if the secret does not exist (404).
 */
async function getSecret(name) {
  const client = getClient();
  try {
    const secret = await client.getSecret(name);
    return secret.value;
  } catch (err) {
    if (err.statusCode === 404) return null;
    throw err;
  }
}

/**
 * Create or update a secret in Azure Key Vault.
 */
async function setSecret(name, value) {
  const client = getClient();
  await client.setSecret(name, value);
}

/**
 * Soft-delete a secret from Azure Key Vault.
 */
async function deleteSecret(name) {
  const client = getClient();
  await client.beginDeleteSecret(name);
}

module.exports = { getSecret, setSecret, deleteSecret };
