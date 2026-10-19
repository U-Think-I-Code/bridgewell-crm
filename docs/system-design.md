# Bridgewell CRM — System Design

## Overview
Bridgewell CRM is a multi-tenant, real-time student admissions management system built for education consultancies. It tracks leads from first contact through enrollment, manages counselor assignments, and provides performance analytics.

**Stack:** Next.js 16 (App Router) · Supabase (PostgreSQL + Realtime + Auth + Storage) · TypeScript · Tailwind CSS

## Multi-Tenancy Model
Each organisation (consultancy branch) is a separate tenant. All tenant-owned tables include organization_id as a foreign key to the organizations table. Row Level Security policies enforce isolation.

## Domain Entities
- organizations — Each consultancy / branch
- users — Staff members (counselors, managers); belong to an org
- leads — Prospective students; owned by one org, optionally assigned to one counselor
- stages — Configurable pipeline stages per org
- activities — Timeline of every interaction on a lead
- assignments — History of lead-to-counselor assignment changes
- audit_logs — Immutable field-change log for compliance
- notifications — In-app alerts
- email_templates — Reusable email message templates per org
- lead_documents — Metadata for uploaded files
- user_sessions — Online/idle status tracking

## Key Design Decisions
1. No money as floats — budget figures use INTEGER minor units (paise or cents)
2. Soft deletes — leads, stages, email_templates, users use deleted_at
3. Append-only audit log — audit_logs never updated; only INSERT via RLS
4. Counselor assignment nullable — leads.owner_id is NULL for unassigned leads
5. Realtime via Postgres logical replication
6. Storage paths scoped by org — {organization_id}/{lead_id}/{filename}
