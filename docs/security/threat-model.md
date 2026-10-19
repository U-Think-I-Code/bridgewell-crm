# Bridgewell CRM — Application Threat Model

## 1. Overview & Trust Boundaries

Bridgewell CRM is a multi-tenant admissions and lead management system for education consultancies. It processes prospective student Personally Identifiable Information (PII), academic records, counselor calling activities, and financial/budget data.

```
       [ Untrusted Internet ]
                  │
     ┌────────────┼──────────────────────────┐
     ▼            ▼                          ▼
[Browser Client] [Meta Webhook]     [Storage Uploads]
     │ (HTTPS)    │ (HTTPS/HMAC)             │ (Pre-Signed)
═════╪════════════╪══════════════════════════╪═════════════════  [Trust Boundary 1: Network Ingress]
     ▼            ▼                          │
[Next.js App Server / API Routes]             │
     │                                       │
═════╪═══════════════════════════════════════╪═════════════════  [Trust Boundary 2: Server to Data Store]
     ▼                                       ▼
[Supabase PostgreSQL + RLS]        [Private Object Storage]
```

---

## 2. Asset Inventory

| Asset Classification | Description & Examples | Impact if Compromised |
| :--- | :--- | :--- |
| **Student PII** | Full name, phone, email, WhatsApp, address, country preference, course interest | High (Data protection breach, reputation damage) |
| **Academic & Identity Documents** | Passport scans, academic transcripts, IELTS/TOEFL scorecards, SOP, financial affidavits | Critical (Identity theft, regulatory fines) |
| **User & Staff Credentials** | Counselor, manager, and admin credentials, JWT session tokens, Supabase keys | Critical (Full account takeover, unauthorized data access) |
| **Lead Pipeline & Financial Data** | Student tuition budgets, consultancy fee collections, admissions stage conversion | High (Competitive intelligence loss, financial fraud) |
| **System Audit Trails** | Counselor call history, lead reassignment logs, compliance change history | Medium-High (Loss of accountability, tamper evidence) |
| **External Integration Secrets** | Meta Page Access Token, JustCall API tokens, Webhook verify tokens | High (Ad campaign hijacking, toll fraud) |

---

## 3. Attack Surface & Entry Points

| Entry Point | Method / Protocol | Data Flow / Destination | OWASP Categories |
| :--- | :--- | :--- | :--- |
| **Meta Webhook Endpoint** (`/api/webhooks/meta`) | HTTP POST / Public Ingress | Ingests incoming leads from Meta Ads into `leads`, `activities`, and `notifications` | A01, A04, A07 |
| **Webhook Handshake** (`/api/webhooks/meta`) | HTTP GET / Public Ingress | Verifies token handshake with Meta developer platform | A02, A07 |
| **Pre-Signed Upload Request** (`/api/storage/upload-url`) | HTTP POST / Authenticated | Issues short-lived pre-signed URL for direct browser storage upload | A01, A04, A05 |
| **Direct Browser Storage Upload** | HTTP PUT to Storage API | Streams binary document to object storage bucket | A04, A08 |
| **Download Document Request** (`/api/storage/download-url`) | HTTP POST / Authenticated | Checks tenant authorization and issues 60s signed download URL | A01, A04 |
| **Document Confirm Endpoint** (`/api/storage/confirm`) | HTTP POST / Authenticated | Saves file metadata and tenant key into `lead_documents` | A01, A08 |
| **Counselor Auth & Session** (`/api/auth` / Supabase Auth) | HTTP POST / Client JWT | Issues session tokens, handles counselor sign-in/out | A01, A07 |
| **Lead Creation & CSV Import** (`AddLeadModal`, `CSVImportModal`) | Client RPC to Supabase | Bulk/single insert into `leads`, `activities` | A03, A04 |
| **Search & Filter Forms** (`/leads?search=...`) | Client Query | Generates PostgREST query with ILIKE / OR filters | A03 |
| **Realtime WebSockets** (`supabase.channel(...)`) | WSS | Pushes table mutation events to connected counselor browsers | A01, A04 |

---

## 4. Threat Matrix (Mapped to OWASP Top 10: 2021)

| Threat ID | OWASP Category | Threat Description & Attack Vector | Likelihood | Impact | Existing Mitigations | Missing Mitigations |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **TH-01** | **A01: Broken Access Control** | **Cross-Tenant Data Leakage**: Counselor from Org A crafts API request with Org B's `lead_id` or `document_id`. | High | Critical | Multi-tenant schema design with `organization_id`; Storage authorization check in `/api/storage/download-url`. | Full RLS enforcement on all database tables via migration; Strict API middleware checking `auth.uid()` tenant claim. |
| **TH-02** | **A01: Broken Access Control** | **Role Escalation**: Telecaller updates their own user record to `admin` via direct Supabase client call. | Medium | Critical | Role checks in frontend UI elements. | Database-level trigger/RLS policy prohibiting non-admins from modifying `role` or `organization_id`. |
| **TH-03** | **A02: Cryptographic Failures** | **Hardcoded Verification Secret**: Default token `'bridgewell_meta_webhook_2026'` hardcoded in source. | High | Medium | Environment variable fallback `process.env.META_VERIFY_TOKEN`. | Enforce strict env check without insecure hardcoded default. |
| **TH-04** | **A02: Cryptographic Failures** | **Tokens in localStorage**: Supabase JWT auth token stored in browser localStorage vulnerable to XSS exfiltration. | Medium | High | Modern React escapes HTML text nodes. | Migrate session handling to HttpOnly, SameSite, Secure cookies via `@supabase/ssr`. |
| **TH-05** | **A03: Injection** | **PostgREST Filter Injection**: Unsanitized search query in `query.or('name.ilike.%' + search + '%,...')` with commas or parens. | Medium | Medium | PostgREST escapes standard parameters; Supabase client handles base escaping. | Explicit input sanitization stripping commas, quotes, and parens before appending to `.or()` clauses. |
| **TH-06** | **A04: Insecure Design** | **Unauthenticated Meta Webhook Lead Flooding**: Attacker spams `/api/webhooks/meta` with dummy leads. | High | High | Country and duplicate phone detection. | Mandatory `X-Hub-Signature-256` HMAC validation against `META_APP_SECRET`. |
| **TH-07** | **A05: Security Misconfiguration** | **Missing HTTP Security Headers**: No CSP, HSTS, X-Frame-Options configured in Next.js config. | High | Medium | HTTPS enforced on cloud deployments. | Configure `headers()` in `next.config.ts` (CSP, HSTS, X-Content-Type-Options, X-Frame-Options: DENY). |
| **TH-08** | **A05: Security Misconfiguration** | **Verbose Error Leakage**: Internal Postgres constraint names or error objects returned to API clients. | Medium | Low | Basic try/catch wrappers. | Sanitize API responses to return generic error messages in production while logging details internally. |
| **TH-09** | **A06: Vulnerable & Outdated Components** | **Dev Dependency Flaws**: High severity vulnerability in transitive dev package `braces` via ESLint. | Low | Low | Package is not included in production client or server bundles. | Automated dependency vulnerability monitoring (`dependabot.yml`) and audit gate in CI. |
| **TH-10** | **A07: Identification & Auth Failures** | **Weak Passwords & Brute Force**: Attacker brute-forces counselor login passwords. | Medium | High | Supabase Auth rate limits and password hashing (bcrypt/argon2). | Enforce password complexity rules and optional MFA for administrator accounts. |
| **TH-11** | **A08: Software & Data Integrity Failures** | **Malicious File Upload**: Attacker uploads executable or script disguised as PDF. | High | High | MIME type whitelist + extension validation in `storageService.ts`; Max 25MB size restriction. | Content signature (magic bytes) validation on server before presigned URL issuance. |
| **TH-12** | **A10: Server-Side Request Forgery (SSRF)** | **Meta Graph API Traversal**: Malicious `leadgen_id` containing path characters passed into Facebook Graph API URL. | Low | Medium | Static prefix `https://graph.facebook.com/v21.0/`. | Regex check on `leadgenId` (`/^\d+$/`) before sending HTTP fetch. |

---

## 5. Security Action Plan & Priorities

1. **Immediate (P0):**
   - Add HMAC signature verification (`X-Hub-Signature-256`) to Meta webhook endpoint.
   - Inject complete HTTP Security Headers in `next.config.ts`.
   - Remove hardcoded verify token fallback.
2. **Short-Term (P1):**
   - Sanitize search filter strings before passing to Supabase `.or()`.
   - Migrate JWT tokens from localStorage to HttpOnly cookies.
3. **Ongoing (P2):**
   - Set up Dependabot configuration for continuous dependency scanning.
   - Run regular PITR restoration drills and access control audits.
