# Bridgewell CRM — Database Backup & Disaster Recovery Runbook

## 1. Overview & Policy

This runbook defines the automated backup strategy, retention policies, and step-by-step Point-in-Time Recovery (PITR) procedures for Bridgewell CRM's multi-tenant PostgreSQL / Supabase database.

| Parameter | Specification |
| :--- | :--- |
| **Primary Database Engine** | PostgreSQL 15+ (Hosted on Supabase / Cloud Provider) |
| **Backup Types** | Daily Physical Base Backups + Continuous Write-Ahead Log (WAL) Archiving |
| **Full Backup Frequency** | Daily at **02:00 UTC** (low-traffic maintenance window) |
| **WAL Archiving** | Continuous (max lag: **2 minutes**) |
| **Retention Period** | **30 days** for daily full backups; **7 days** for continuous PITR |
| **RPO (Recovery Point Objective)** | < 2 minutes (data loss bound in disaster) |
| **RTO (Recovery Time Objective)** | < 30 minutes to restore and bring staging/dr instance online |
| **Storage Location** | Geographically redundant, immutable private object storage (AES-256 encrypted) |

---

## 2. Backup Architecture

```
+--------------------------+
|  Production Database     |
|   (PostgreSQL Primary)   |
+------------+-------------+
             |
             +---> Daily 02:00 UTC Full Base Backup ----> [Encrypted Storage: S3/GCS] (30 Days)
             |
             +---> Continuous WAL Archiving -----------> [WAL Archive Bucket] (7-Day PITR)
```

1. **Daily Logical & Physical Dumps**: `pg_dump` and physical snapshots taken automatically.
2. **Write-Ahead Logs (WAL)**: All transactions streamed to WAL archive bucket for point-in-time replay.
3. **Immutability (WORM)**: Backup buckets have Object Lock enabled to prevent accidental deletion or ransomware modification.

---

## 3. Step-by-Step Point-in-Time Recovery (PITR)

> [!CAUTION]
> **CRITICAL RULE**: NEVER restore directly over the active production database! Always restore into a fresh, isolated target database (`bridgewell_crm_restore_test` or staging instance). Once verified, perform an application traffic switch.

### Step 1: Declare Incident & Identify Target Timestamp
Identify the exact point in time to recover to (e.g. right before an accidental drop or corruption incident):
```bash
# Example Target Timestamp:
TARGET_TIMESTAMP="2026-10-19T14:00:00Z"
```

### Step 2: Provision Isolated Recovery Database
Create a clean PostgreSQL instance or staging database:
```sql
CREATE DATABASE bridgewell_crm_restore_test;
```

### Step 3: Trigger Supabase / CLI Point-in-Time Restore
In the Supabase Dashboard:
1. Navigate to **Project Settings** > **Database** > **Backups**.
2. Select **Point in Time Recovery (PITR)**.
3. Specify the target date and time down to the exact second.
4. Select **Restore to a New Project / Instance**.
5. Wait for the restore engine to replay base snapshot + WAL logs up to the specified timestamp.

Or via CLI / pg_restore:
```bash
# Extract full backup
pg_restore -h db.restore.target.com -U postgres -d bridgewell_crm_restore_test -v ./latest_backup.dump
```

### Step 4: Run Data Integrity & Tenant Isolation Verification
Run the automated verification suite to confirm data integrity before opening access:
```bash
node scripts/restore-drill.js
```
The script verifies:
- Table count matches production
- Foreign key constraints intact
- Multi-tenant isolation sanity check passes
- Row count delta within expected RPO range

### Step 5: Switch Application Traffic
Update the application environment variables in staging or Vercel production:
```env
NEXT_PUBLIC_SUPABASE_URL=https://[restored-project-id].supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=[restored-anon-key]
```
Redeploy or trigger instant domain repointing.

---

## 4. Disaster Recovery Drills

A restore drill must be executed **monthly** to validate that backups are uncorrupted and recoverable. The automated script [`scripts/restore-drill.js`](file:///c:/Users/Dell/Documents/Bridgewell%20calling%20crm/scripts/restore-drill.js) simulates this end-to-end.
