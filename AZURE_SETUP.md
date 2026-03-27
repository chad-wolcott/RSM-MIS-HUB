# RSM Defense MIH — Azure Deployment Guide

This document covers everything required to provision the Azure infrastructure and deploy the Managed Identity Hub (MIH) application.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│  GitHub Repository                                                  │
│  └── GitHub Actions → Azure Static Web Apps (CI/CD)                │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Azure Static Web Apps                                              │
│  ├── React SPA (dist/)          ← Vite build output                │
│  └── Azure Functions (api/)     ← Node.js backend                  │
│       ├── GET/POST /api/tenants                                     │
│       ├── GET/POST /api/users                                       │
│       ├── GET      /api/audit-logs                                  │
│       ├── GET/PUT  /api/config/{category}                           │
│       ├── POST     /api/sailpoint-proxy                             │
│       └── GET      /api/health                                      │
└─────────────────────────────────────────────────────────────────────┘
                              │
            ┌─────────────────┼─────────────────┐
            ▼                 ▼                 ▼
┌───────────────────┐ ┌──────────────┐ ┌───────────────────┐
│  Azure Cosmos DB  │ │  Key Vault   │ │  App Insights     │
│  Database: mih    │ │  Secrets     │ │  Telemetry        │
│  ├── tenants      │ │  ├── SP creds│ │  ├── Logs         │
│  ├── users        │ │  └── API keys│ │  ├── Metrics      │
│  ├── audit-logs   │ └──────────────┘ │  └── Alerts       │
│  └── config       │                  └───────────────────┘
└───────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Microsoft Entra ID (Azure AD)                                      │
│  ├── App Registration (client auth)                                 │
│  ├── Groups: MIH-Admins, MIH-Analysts, MIH-Onboarding, MIH-Auditors│
│  └── Managed Identity (Functions → Cosmos DB, Key Vault)           │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Prerequisites

- Azure subscription with Contributor access
- Azure CLI installed: `az --version` (2.50+)
- Node.js 20+ installed
- GitHub repository connected to Azure

---

## Step 1 — Azure Resource Group

Create a dedicated resource group for all MIH resources.

```bash
# Set variables — adjust to your environment
LOCATION="eastus"
RG="rg-rsm-mih-prod"
PREFIX="mih"           # Used as prefix for all resource names

az group create \
  --name "$RG" \
  --location "$LOCATION"
```

---

## Step 2 — Entra ID App Registration

### 2a. Create the App Registration

```bash
# Create the app registration
APP_NAME="RSM-MIH-App"
REPLY_URL="https://<your-swa-hostname>.azurestaticapps.net/auth/callback"

APP_ID=$(az ad app create \
  --display-name "$APP_NAME" \
  --sign-in-audience "AzureADMyOrg" \
  --web-redirect-uris "$REPLY_URL" \
  --enable-id-token-issuance true \
  --query appId -o tsv)

echo "Client ID: $APP_ID"

# Create a service principal
az ad sp create --id "$APP_ID"
```

> **Note:** Add additional redirect URIs after creating the Static Web App (Step 5).
> For local development also add `http://localhost:5173/auth/callback`.

### 2b. Expose an API scope

In the Azure Portal:
1. Go to **Entra ID → App Registrations → RSM-MIH-App**
2. Select **Expose an API**
3. Set Application ID URI: `api://<APP_ID>`
4. Add a scope: `access_as_user` (Admins and users can consent)

### 2c. Configure ID token claims

1. Go to **Token configuration**
2. Add optional claim: **ID token → `groups`** (to receive group memberships in the token)
3. Add optional claim: **Access token → `roles`**

### 2d. Create security groups

```bash
# Create MIH role groups
for GROUP in "MIH-Admins" "MIH-Analysts" "MIH-Onboarding" "MIH-Auditors"; do
  az ad group create --display-name "$GROUP" --mail-nickname "$GROUP"
  echo "Created group: $GROUP"
done

# Get group object IDs (needed for env vars)
for GROUP in "MIH-Admins" "MIH-Analysts" "MIH-Onboarding" "MIH-Auditors"; do
  ID=$(az ad group show --group "$GROUP" --query id -o tsv)
  echo "$GROUP object ID: $ID"
done
```

---

## Step 3 — Azure Cosmos DB

```bash
COSMOS_ACCOUNT="${PREFIX}-cosmos-prod"

# Create Cosmos DB account (serverless for cost efficiency)
az cosmosdb create \
  --name "$COSMOS_ACCOUNT" \
  --resource-group "$RG" \
  --kind GlobalDocumentDB \
  --capabilities EnableServerless \
  --default-consistency-level Session \
  --locations regionName="$LOCATION" failoverPriority=0 isZoneRedundant=false

# Create the database
az cosmosdb sql database create \
  --account-name "$COSMOS_ACCOUNT" \
  --resource-group "$RG" \
  --name "mih"

# Create containers
for CONTAINER_SPEC in \
  "tenants:/id" \
  "users:/id" \
  "audit-logs:/date" \
  "config:/category"
do
  CONTAINER=$(echo $CONTAINER_SPEC | cut -d: -f1)
  PARTITION=$(echo $CONTAINER_SPEC | cut -d: -f2)

  az cosmosdb sql container create \
    --account-name "$COSMOS_ACCOUNT" \
    --resource-group "$RG" \
    --database-name "mih" \
    --name "$CONTAINER" \
    --partition-key-path "$PARTITION"

  echo "Created container: $CONTAINER (partition: $PARTITION)"
done

# Get the connection details
COSMOS_ENDPOINT=$(az cosmosdb show \
  --name "$COSMOS_ACCOUNT" \
  --resource-group "$RG" \
  --query documentEndpoint -o tsv)

COSMOS_KEY=$(az cosmosdb keys list \
  --name "$COSMOS_ACCOUNT" \
  --resource-group "$RG" \
  --query primaryMasterKey -o tsv)

echo "COSMOS_ENDPOINT: $COSMOS_ENDPOINT"
echo "COSMOS_KEY: $COSMOS_KEY"
```

### Cosmos DB TTL for Audit Logs (optional)

To automatically purge audit logs older than 1 year (31,536,000 seconds):

```bash
az cosmosdb sql container update \
  --account-name "$COSMOS_ACCOUNT" \
  --resource-group "$RG" \
  --database-name "mih" \
  --name "audit-logs" \
  --analytical-storage-ttl -1 \
  --ttl 31536000
```

---

## Step 4 — Azure Key Vault

```bash
VAULT_NAME="${PREFIX}-kv-prod"

# Create Key Vault
az keyvault create \
  --name "$VAULT_NAME" \
  --resource-group "$RG" \
  --location "$LOCATION" \
  --enable-rbac-authorization true \
  --sku standard

VAULT_URI="https://${VAULT_NAME}.vault.azure.net/"
echo "KEYVAULT_URI: $VAULT_URI"
```

Key Vault will store:
- `sailpoint-client-id-{tenantId}` — SailPoint ISC client IDs
- `sailpoint-client-secret-{tenantId}` — SailPoint ISC client secrets
- `delinea-vault-token` — Delinea/Thycotic PAM vault token
- `local-user-hash-{email}` — Local user password hashes (break-glass accounts)

---

## Step 5 — Azure Static Web Apps

### 5a. Create the Static Web App

```bash
SWA_NAME="${PREFIX}-swa-prod"
GITHUB_REPO="chad-wolcott/rsm-mis-hub"   # Update to your repo
GITHUB_BRANCH="main"

az staticwebapp create \
  --name "$SWA_NAME" \
  --resource-group "$RG" \
  --location "eastus2" \
  --source "https://github.com/$GITHUB_REPO" \
  --branch "$GITHUB_BRANCH" \
  --app-location "/" \
  --api-location "api" \
  --output-location "dist" \
  --login-with-github

# Get the hostname
SWA_HOSTNAME=$(az staticwebapp show \
  --name "$SWA_NAME" \
  --resource-group "$RG" \
  --query defaultHostname -o tsv)

echo "SWA Hostname: https://$SWA_HOSTNAME"
```

### 5b. Get the deployment token

```bash
SWA_TOKEN=$(az staticwebapp secrets list \
  --name "$SWA_NAME" \
  --resource-group "$RG" \
  --query properties.apiKey -o tsv)

echo "AZURE_STATIC_WEB_APPS_API_TOKEN: $SWA_TOKEN"
```

Store this as a GitHub secret: **Settings → Secrets → Actions → `AZURE_STATIC_WEB_APPS_API_TOKEN`**

---

## Step 6 — Application Insights

```bash
INSIGHTS_NAME="${PREFIX}-insights-prod"
WORKSPACE_NAME="${PREFIX}-logs-prod"

# Create Log Analytics workspace
az monitor log-analytics workspace create \
  --resource-group "$RG" \
  --workspace-name "$WORKSPACE_NAME" \
  --location "$LOCATION"

WORKSPACE_ID=$(az monitor log-analytics workspace show \
  --resource-group "$RG" \
  --workspace-name "$WORKSPACE_NAME" \
  --query id -o tsv)

# Create Application Insights
az monitor app-insights component create \
  --app "$INSIGHTS_NAME" \
  --resource-group "$RG" \
  --location "$LOCATION" \
  --kind web \
  --application-type web \
  --workspace "$WORKSPACE_ID"

INSIGHTS_KEY=$(az monitor app-insights component show \
  --app "$INSIGHTS_NAME" \
  --resource-group "$RG" \
  --query instrumentationKey -o tsv)

INSIGHTS_CONN=$(az monitor app-insights component show \
  --app "$INSIGHTS_NAME" \
  --resource-group "$RG" \
  --query connectionString -o tsv)

echo "APPINSIGHTS_INSTRUMENTATIONKEY: $INSIGHTS_KEY"
echo "APPLICATIONINSIGHTS_CONNECTION_STRING: $INSIGHTS_CONN"
```

---

## Step 7 — Managed Identity for Azure Functions

Give the Azure Functions a system-assigned identity so it can authenticate to Cosmos DB and Key Vault without storing credentials in environment variables.

```bash
# Enable system-assigned identity on the Static Web App's Functions
az staticwebapp identity assign \
  --name "$SWA_NAME" \
  --resource-group "$RG"

# Get the principal ID
PRINCIPAL_ID=$(az staticwebapp identity show \
  --name "$SWA_NAME" \
  --resource-group "$RG" \
  --query principalId -o tsv)

echo "Managed Identity Principal ID: $PRINCIPAL_ID"

# Grant Cosmos DB access (built-in data contributor role)
COSMOS_SCOPE=$(az cosmosdb show \
  --name "$COSMOS_ACCOUNT" \
  --resource-group "$RG" \
  --query id -o tsv)

az cosmosdb sql role assignment create \
  --account-name "$COSMOS_ACCOUNT" \
  --resource-group "$RG" \
  --role-definition-name "Cosmos DB Built-in Data Contributor" \
  --principal-id "$PRINCIPAL_ID" \
  --scope "$COSMOS_SCOPE"

# Grant Key Vault Secrets User role
VAULT_SCOPE=$(az keyvault show \
  --name "$VAULT_NAME" \
  --resource-group "$RG" \
  --query id -o tsv)

az role assignment create \
  --role "Key Vault Secrets User" \
  --assignee-object-id "$PRINCIPAL_ID" \
  --assignee-principal-type ServicePrincipal \
  --scope "$VAULT_SCOPE"

echo "Managed Identity permissions granted."
```

> **Important:** When using Managed Identity, you can remove `COSMOS_KEY` from environment variables entirely. The `DefaultAzureCredential` in `api/lib/keyVault.js` automatically uses the managed identity in Azure. To also use it for Cosmos DB, update `api/lib/cosmos.js` to use `@azure/identity` instead of the key.

---

## Step 8 — Configure Environment Variables

### GitHub Secrets (for the CI/CD workflow)

Go to **GitHub → Repository → Settings → Secrets and variables → Actions** and add:

| Secret Name | Value | Source |
|------------|-------|--------|
| `AZURE_STATIC_WEB_APPS_API_TOKEN` | SWA deployment token | Step 5b |
| `VITE_ENTRA_CLIENT_ID` | App Registration Client ID | Step 2a |
| `VITE_ENTRA_TENANT_ID` | Your Azure AD Tenant ID | Azure Portal |
| `VITE_REDIRECT_URI` | `https://<swa-hostname>/auth/callback` | Step 5 |
| `VITE_GROUP_ADMIN` | `MIH-Admins` | Step 2d |
| `VITE_GROUP_ONBOARDING` | `MIH-Onboarding` | Step 2d |
| `VITE_GROUP_ANALYST` | `MIH-Analysts` | Step 2d |
| `VITE_GROUP_AUDITOR` | `MIH-Auditors` | Step 2d |

### Azure Functions Application Settings

These are the runtime environment variables for the Azure Functions backend.
Set them via the Azure Portal or CLI:

```bash
# Set all Azure Functions application settings
az staticwebapp appsettings set \
  --name "$SWA_NAME" \
  --resource-group "$RG" \
  --setting-names \
    "COSMOS_ENDPOINT=$COSMOS_ENDPOINT" \
    "COSMOS_KEY=$COSMOS_KEY" \
    "COSMOS_DATABASE=mih" \
    "KEYVAULT_URI=$VAULT_URI" \
    "ENTRA_TENANT_ID=<your-tenant-id>" \
    "ENTRA_CLIENT_ID=$APP_ID" \
    "APPINSIGHTS_INSTRUMENTATIONKEY=$INSIGHTS_KEY" \
    "APPLICATIONINSIGHTS_CONNECTION_STRING=$INSIGHTS_CONN"
```

> **Production recommendation:** Omit `COSMOS_KEY` and use Managed Identity instead (Step 7). Update `api/lib/cosmos.js` to use `DefaultAzureCredential`.

### Local Development (.env file)

Copy `api/local.settings.json.example` to `api/local.settings.json` and fill in values:

```bash
cp api/local.settings.json.example api/local.settings.json
# Edit api/local.settings.json with your development values
```

Create a `.env.local` file in the project root for frontend env vars:

```bash
cat > .env.local << 'EOF'
VITE_ENTRA_CLIENT_ID=<your-client-id>
VITE_ENTRA_TENANT_ID=<your-tenant-id>
VITE_REDIRECT_URI=http://localhost:5173/auth/callback
VITE_GROUP_ADMIN=MIH-Admins
VITE_GROUP_ONBOARDING=MIH-Onboarding
VITE_GROUP_ANALYST=MIH-Analysts
VITE_GROUP_AUDITOR=MIH-Auditors
EOF
```

---

## Step 9 — Update Entra App Registration Redirect URIs

After creating the Static Web App, add the production redirect URI:

```bash
# Get the current redirect URIs
CURRENT_URIS=$(az ad app show --id "$APP_ID" --query web.redirectUris -o json)

# Add both dev and prod URIs
az ad app update \
  --id "$APP_ID" \
  --web-redirect-uris \
    "http://localhost:5173/auth/callback" \
    "https://$SWA_HOSTNAME/auth/callback"
```

In the Azure Portal, also go to **Authentication → Implicit grant and hybrid flows** and enable:
- **ID tokens** ✅
- **Access tokens** ✅ (for single-page application flows)

Add the SPA platform:
1. **Authentication → Add a platform → Single-page application**
2. Redirect URI: `https://<swa-hostname>/auth/callback`
3. Click Configure

---

## Step 10 — Initial Configuration Seeding

After first deployment, seed the configuration defaults into Cosmos DB by calling the config API:

```bash
# Get the access token for an admin user first, then:
ADMIN_TOKEN="<bearer-token-from-admin-login>"
SWA_URL="https://$SWA_HOSTNAME"

# Seed general settings
curl -X PUT "$SWA_URL/api/config/general" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "orgName": { "value": "RSM Defense", "description": "Organization display name" },
    "supportEmail": { "value": "mih-support@rsmdefense.com", "description": "Support contact email" },
    "sessionTimeoutMinutes": { "value": 60, "description": "Session idle timeout in minutes" },
    "maxFailedLogins": { "value": 5, "description": "Max failed login attempts before lockout" }
  }'

# Seed IdP settings
curl -X PUT "$SWA_URL/api/config/idp" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "provider": { "value": "entra", "description": "Identity provider: entra | local | both" },
    "mfaRequired": { "value": true, "description": "Require MFA for all users" },
    "groupAdmin": { "value": "MIH-Admins", "description": "Entra group for Administrators" },
    "groupOnboarding": { "value": "MIH-Onboarding", "description": "Entra group for Onboarding Agents" },
    "groupAnalyst": { "value": "MIH-Analysts", "description": "Entra group for Analysts" },
    "groupAuditor": { "value": "MIH-Auditors", "description": "Entra group for Auditors" }
  }'
```

---

## Step 11 — GitHub Actions Setup

The CI/CD pipeline is defined in `.github/workflows/azure-static-web-apps.yml`.

It triggers on:
- **Push to `main`** → full production deployment
- **Pull Request** → creates a preview environment (auto-deleted on PR close)

Verify the workflow runs:
1. Push to `main` branch
2. Go to **GitHub → Actions** and watch the "Deploy to Azure Static Web Apps" workflow
3. On success, visit `https://<swa-hostname>` to verify the deployment

---

## Step 12 — Custom Domain (Optional)

```bash
CUSTOM_DOMAIN="mih.rsmdefense.com"

az staticwebapp hostname set \
  --name "$SWA_NAME" \
  --resource-group "$RG" \
  --hostname "$CUSTOM_DOMAIN"

# Get the CNAME or TXT record to configure with your DNS provider
az staticwebapp hostname show \
  --name "$SWA_NAME" \
  --resource-group "$RG" \
  --hostname "$CUSTOM_DOMAIN"
```

Update the Entra App Registration redirect URI with the custom domain and update `VITE_REDIRECT_URI` in GitHub secrets.

---

## Local Development Workflow

### Terminal 1 — Azure Functions Emulator

```bash
# Install Azure Functions Core Tools globally (one time)
npm install -g azure-functions-core-tools@4 --unsafe-perm true

# Install API dependencies
cd api
npm install

# Copy and configure local settings
cp local.settings.json.example local.settings.json
# Edit local.settings.json with your dev values

# Start the functions emulator
func start
# Functions run at http://localhost:7071/api/*
```

### Terminal 2 — Vite Dev Server

```bash
# From the project root
npm install
npm run dev
# App runs at http://localhost:5173
# /api/* requests are proxied to http://localhost:7071
```

---

## Monitoring and Alerts

### View Application Insights

```bash
# Open Application Insights in the browser
az monitor app-insights component show \
  --app "$INSIGHTS_NAME" \
  --resource-group "$RG" \
  --query id -o tsv | xargs az portal open
```

### Set Up Alerts

```bash
# Alert: Function error rate > 5%
az monitor metrics alert create \
  --name "mih-function-errors" \
  --resource-group "$RG" \
  --scopes "$(az staticwebapp show --name $SWA_NAME --resource-group $RG --query id -o tsv)" \
  --condition "avg requests/failed > 5" \
  --window-size 5m \
  --evaluation-frequency 1m \
  --severity 2 \
  --description "MIH API error rate above 5%"
```

---

## Security Checklist

- [ ] Entra ID App Registration configured with correct redirect URIs
- [ ] Groups created and users assigned in Entra ID
- [ ] Cosmos DB firewall restricted to Azure services only
- [ ] Key Vault access policies set to deny public access
- [ ] Managed Identity used (no credentials in environment variables)
- [ ] Application Insights connected and monitoring active
- [ ] HTTPS enforced (Static Web Apps enforces this by default)
- [ ] Security headers configured in `staticwebapp.config.json`
- [ ] Bootstrap local admin (`chad.wolcott@rsmus.com`) disabled after Entra is configured
- [ ] Audit log TTL configured in Cosmos DB
- [ ] GitHub branch protection rules set on `main`
- [ ] `api/local.settings.json` added to `.gitignore`
- [ ] `.env.local` added to `.gitignore`

---

## Cost Estimation (Monthly)

| Service | Tier | Estimated Cost |
|---------|------|----------------|
| Azure Static Web Apps | Standard | ~$9/month |
| Azure Cosmos DB | Serverless | ~$0–25/month (usage-based) |
| Azure Key Vault | Standard | ~$0.03/10k operations |
| Application Insights | Pay-as-you-go | ~$2.30/GB ingested |
| Log Analytics Workspace | Pay-as-you-go | ~$2.30/GB ingested |
| **Total (low usage)** | | **~$15–20/month** |

---

## Troubleshooting

### Functions not returning data
- Check `api/local.settings.json` has correct `COSMOS_ENDPOINT` and `COSMOS_KEY`
- Verify Cosmos DB containers were created (Step 3)
- Run `func start` in the `api/` directory and check console output

### MSAL login redirects fail
- Verify redirect URI in Entra App Registration matches exactly (including trailing slash)
- Ensure both SPA and Web platforms are configured in Authentication

### 401 Unauthorized from API
- Confirm `ENTRA_TENANT_ID` and `ENTRA_CLIENT_ID` are set in Functions app settings
- Check that the user's Entra account is in one of the MIH groups
- Verify the access token is being acquired (check browser DevTools → Application → Session Storage)

### Cosmos DB connection errors
- Confirm the Cosmos DB account is not paused (serverless accounts pause after inactivity)
- Check firewall rules allow Azure Functions access
- Verify `COSMOS_DATABASE` is set to `mih`
