# Database Backup & Disaster Recovery Guide

GhostClass uses an automated, zero-trust database backup system that creates encrypted PostgreSQL backups twice daily, uploads them to Cloudflare R2 Object Storage, and prunes expired archives.

---

## 🏗️ Architecture & Security Model

```text
Supabase PostgreSQL
       │
       │ (pg_dump -Fc)
       ▼
┌──────────────────────────────────────────────┐
│  Automated Backup Container (Coolify / Cron) │
│                                              │
│  1. Stream dump through zstd (level 19)      │
│  2. Asymmetric encryption via age            │
│  3. Calculate SHA-256 checksum               │
│  4. Upload archive + checksum to CF R2       │
│  5. Verify remote object size & existence    │
│  6. Prune expired daily backups (>14 days)   │
│  7. Secure scratch wipe in /tmp              │
└──────────────────────┬───────────────────────┘
                       │ (S3-compatible API)
                       ▼
            Cloudflare R2 Storage
```

### Key Security Guarantees

- **Zero Plaintext on Disk**: `pg_dump` streams through `zstd` and `age` directly into the encrypted archive. Raw unencrypted data is never written to disk.
- **Zero-Trust Asymmetric Encryption (`age`)**: The backup container only holds the **public key** (`AGE_RECIPIENT=age1...`). The private key (`AGE-SECRET-KEY-1...`) is kept offline in your password manager. Even if your server, container, or R2 bucket is compromised, attackers **cannot** decrypt your database backups.
- **Scoped Credentials**: R2 API credentials only have Read/Write access to the specific backup bucket.

---

## 📁 Cloudflare R2 Storage Hierarchy

```text
<R2_BUCKET>/
└── database/
    └── daily/
        ├── 2026-08-29_02-00-00.dump.zst.age
        ├── 2026-08-29_02-00-00.dump.zst.age.sha256
        ├── 2026-08-29_14-00-00.dump.zst.age
        └── 2026-08-29_14-00-00.dump.zst.age.sha256
```

---

## 🚀 Setup Walkthrough

### Step 1: Generate the `age` Encryption Keypair

Run this once on your **local development machine** (Linux, macOS, or WSL):

#### Option A: Classical Key (Standard X25519)

```bash
# Generate a standard 256-bit X25519 keypair
age-keygen -o ghostclass-backup.key
```

Output:

```text
# created: 2026-08-29T...
# public key: age1ql3z7hjy54pw3hyww5ayyfg7zqgvc7w3j2elw8zmrj2kg5sfn9aqmcac8p
AGE-SECRET-KEY-10Q8U5P...
```

#### Option B: Post-Quantum Hybrid Key via `age-plugin-simplepq` (Kyber768 + X25519)

`age-plugin-simplepq` implements Post-Quantum Hybrid encryption combining NIST-standardized **Kyber768 / ML-KEM** with **X25519**:

```bash
# 1. Install plugin (if not already installed via cargo)
cargo install age-plugin-simplepq

# 2. Generate secret identity file
age-plugin-simplepq -o ghostclass-pq-identity.txt

# 3. Extract public recipient key
age-plugin-simplepq -y -o ghostclass-pq-recipient.txt ghostclass-pq-identity.txt
```

Output:

- Public Recipient (`ghostclass-pq-recipient.txt`): `age1simplepq1...`
- Private Identity (`ghostclass-pq-identity.txt`): `AGE-PLUGIN-SIMPLEPQ-1...`

#### Option C: Dual-Layer Hybrid Encryption (Maximum Resilience)

You can pass **both** your classical key and PQ simplepq key in `AGE_RECIPIENT`:

```bash
AGE_RECIPIENT="age1ql3z7hjy54pw3hyww5ayyfg7zqgvc7w3j2elw8zmrj2kg5sfn9aqmcac8p age1simplepq1..."
```

> **Why Hybrid?** Hybrid encryption protects against cryptanalytic breakthroughs in newer lattice algorithms while ensuring full mathematical protection against future quantum computers ("Harvest Now, Decrypt Later" attacks).

1. Copy the **public key(s)** (`age1...` and/or `age1simplepq1...`) $\rightarrow$ Set in `AGE_RECIPIENT` (single key or space-separated for hybrid).
2. Save the **secret identity key(s)** (`AGE-SECRET-KEY-1...` and/or `AGE-PLUGIN-SIMPLEPQ-1...`) into your secure password manager (e.g. 1Password, Bitwarden, KeePass).
3. **DO NOT** put the private secret key on Coolify or in the backup container.

---

### Step 2: Create a Cloudflare R2 Bucket & API Token

1. In the **Cloudflare Dashboard**, navigate to **R2 Object Storage** $\rightarrow$ **Create Bucket**.
2. Name the bucket (e.g. `ghostclass-backups`).
3. Under **Manage R2 API Tokens**, click **Create API Token**:
   - **Permissions**: _Object Read & Write_
   - **Specify bucket(s)**: Select `ghostclass-backups`
   - **TTL**: Forever (or as per your security policy)
4. Note the generated credentials:
   - `R2_ACCESS_KEY_ID`
   - `R2_SECRET_ACCESS_KEY`
   - `R2_ENDPOINT` (Format: `https://<account_id>.r2.cloudflarestorage.com`)
   - `R2_BUCKET` (`ghostclass-backups`)

---

### Step 3: Get the Supabase PostgreSQL Connection String

`pg_dump` connects directly over PostgreSQL's wire protocol and requires your PostgreSQL database password.

1. In the **Supabase Dashboard**, navigate to **Project Settings** $\rightarrow$ **Database**.
2. Under **Connection String** $\rightarrow$ select **URI** (Session mode or Direct mode):

   ```text
   postgresql://postgres.[project-ref]:[YOUR-PASSWORD]@aws-0-[region].pooler.supabase.com:5432/postgres
   ```

3. Replace `[YOUR-PASSWORD]` with your real database password $\rightarrow$ This is your `SUPABASE_DB_URL`.

---

### Step 4: Add Environment Variables to Infisical `/runtime`

In your Infisical Dashboard under the **`/runtime`** folder (Production environment), configure:

| Variable Name           | Description                     | Example / Format                                      |
| ----------------------- | ------------------------------- | ----------------------------------------------------- |
| `R2_ACCESS_KEY_ID`      | Cloudflare R2 S3 Token ID       | `0123456789abcdef...`                                 |
| `R2_SECRET_ACCESS_KEY`  | Cloudflare R2 S3 Token Secret   | `abcdef0123456789...`                                 |
| `R2_ENDPOINT`           | Cloudflare R2 Endpoint          | `https://<account_id>.r2.cloudflarestorage.com`       |
| `R2_BUCKET`             | Cloudflare R2 Bucket Name       | `ghostclass-backups`                                  |
| `AGE_RECIPIENT`         | Asymmetric Age Public Key       | `age1ql3z7hjy...`                                     |
| `SUPABASE_DB_URL`       | PostgreSQL URI with DB password | `postgresql://postgres.[ref]:[pwd]@...:5432/postgres` |
| `BACKUP_RETENTION_DAYS` | Daily backup retention (days)   | `14`                                                  |

---

### Step 5: Configure Scheduled Execution in Coolify

#### Option A: Dedicated Coolify Scheduled Service (Recommended)

1. In Coolify, create a new Service/Application using this repository with Dockerfile path: `backup/Dockerfile`.
2. Configure the environment variables (or supply `INFISICAL_TOKEN` and `INFISICAL_PROJECT_ID` so secrets are injected into memory at runtime).
3. Set the cron schedule for **twice daily**:

   ```cron
   0 2,14 * * *
   ```

   _(Executes every day at 02:00 UTC and 14:00 UTC)._

#### Option B: Coolify Scheduled Task / Cron Command

If running via an existing container with Infisical CLI:

```bash
infisical run --projectId "$INFISICAL_PROJECT_ID" --path /runtime --env prod -- /usr/local/bin/backup-db.sh
```

---

## 🔄 Disaster Recovery & Test Restore

### Option 1: Safe Verification Test (Dry-run, zero database modification)

Downloads the latest backup from R2, verifies SHA-256 integrity, decrypts using your private identity (`AGE-PLUGIN-SIMPLEPQ-1...` or `AGE-SECRET-KEY-1...`), and verifies the PostgreSQL dump table catalog:

```bash
infisical run --env=dev --projectId=18d6333d-391c-45f5-a40f-9e8746792a00 --path=/runtime -- docker run --rm \
  -e R2_ACCESS_KEY_ID \
  -e R2_SECRET_ACCESS_KEY \
  -e R2_ENDPOINT \
  -e R2_BUCKET \
  -e AGE_SECRET_KEY="AGE-PLUGIN-SIMPLEPQ-1..." \
  -e VERIFY_ONLY=true \
  --entrypoint /usr/local/bin/restore-db.sh \
  ghostclass-backup
```

---

### Option 2: Full Restore into a Local Temporary PostgreSQL Container

1. **Spin up a temporary PostgreSQL 17 test container**:

   ```bash
   docker run -d --name pg-test -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:17-alpine
   ```

2. **Run the restore tool targeting the test container**:

   ```bash
   infisical run --env=dev --projectId=18d6333d-391c-45f5-a40f-9e8746792a00 --path=/runtime -- docker run --rm \
     --network host \
     -e R2_ACCESS_KEY_ID \
     -e R2_SECRET_ACCESS_KEY \
     -e R2_ENDPOINT \
     -e R2_BUCKET \
     -e AGE_SECRET_KEY="AGE-PLUGIN-SIMPLEPQ-1..." \
     -e TARGET_DB_URL="postgresql://postgres:postgres@localhost:5432/postgres" \
     --entrypoint /usr/local/bin/restore-db.sh \
     ghostclass-backup
   ```

3. **Verify restored tables**:

   ```bash
   docker exec -it pg-test psql -U postgres -d postgres -c "\dt"
   ```

4. **Clean up test database**:

   ```bash
   docker rm -f pg-test
   ```

---

## 🛠️ Local Testing of the Backup Pipeline

To test the backup script locally without waiting for cron:

```bash
# Set your environment variables
export SUPABASE_DB_URL="postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres"
export AGE_RECIPIENT="age1ql3z..."
export R2_ACCESS_KEY_ID="..."
export R2_SECRET_ACCESS_KEY="..."
export R2_ENDPOINT="https://<account_id>.r2.cloudflarestorage.com"
export R2_BUCKET="ghostclass-backups"

# Run backup script
./backup/backup-db.sh
```
