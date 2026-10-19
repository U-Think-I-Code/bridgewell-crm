-- ============================================================================
-- Migration: 20261019000000_initial_schema.sql
-- Description: Multi-tenant production database schema for Bridgewell CRM
-- Stack: Supabase / PostgreSQL with Row-Level Security (RLS)
-- ============================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. HELPER FUNCTION: Trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 3. TABLES DEFINITION
-- ============================================================================

-- Table 1: organizations (Root Tenant Entity)
CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL CHECK (char_length(trim(name)) >= 2),
    slug TEXT NOT NULL CHECK (slug ~ '^[a-z0-9-]+$'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    deleted_at TIMESTAMPTZ,
    CONSTRAINT uq_organizations_slug UNIQUE (slug)
);

-- Table 2: users (Staff Members: Admin, Manager, Counselor, Telecaller)
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    auth_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    name TEXT NOT NULL CHECK (char_length(trim(name)) >= 2),
    email TEXT NOT NULL CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
    role TEXT NOT NULL CHECK (role IN ('admin', 'manager', 'counselor', 'telecaller')),
    status TEXT NOT NULL DEFAULT 'offline' CHECK (status IN ('online', 'idle', 'offline')),
    last_active_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    deleted_at TIMESTAMPTZ,
    CONSTRAINT uq_users_org_email UNIQUE (organization_id, email)
);

-- Table 3: stages (Configurable Pipeline Stages)
CREATE TABLE IF NOT EXISTS stages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (char_length(trim(name)) >= 1),
    slug TEXT NOT NULL CHECK (slug ~ '^[a-z0-9_]+$'),
    color TEXT NOT NULL DEFAULT '#6366f1' CHECK (color ~ '^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$'),
    display_order INTEGER NOT NULL DEFAULT 0 CHECK (display_order >= 0),
    is_terminal BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    deleted_at TIMESTAMPTZ,
    CONSTRAINT uq_stages_org_slug UNIQUE (organization_id, slug)
);

-- Table 4: leads (Prospective Students)
CREATE TABLE IF NOT EXISTS leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    owner_id UUID REFERENCES users(id) ON DELETE SET NULL,
    stage_id UUID REFERENCES stages(id) ON DELETE SET NULL,
    name TEXT NOT NULL CHECK (char_length(trim(name)) >= 1),
    email TEXT CHECK (email IS NULL OR email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
    phone TEXT NOT NULL CHECK (char_length(trim(phone)) >= 7),
    alt_phone TEXT,
    course_interest TEXT,
    country_preference TEXT,
    source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'meta_ads', 'website', 'referral', 'walk_in', 'csv_import')),
    ad_campaign_name TEXT,
    status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'interested', 'meeting_scheduled', 'enrolled', 'lost', 'rejected')),
    budget_minor INTEGER NOT NULL DEFAULT 0 CHECK (budget_minor >= 0),
    currency VARCHAR(3) NOT NULL DEFAULT 'INR' CHECK (char_length(currency) = 3),
    priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
    next_follow_up TIMESTAMPTZ,
    notes TEXT,
    meta_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    deleted_at TIMESTAMPTZ
);

-- Table 5: activities (Lead Interactions Timeline)
CREATE TABLE IF NOT EXISTS activities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    type TEXT NOT NULL CHECK (type IN ('call', 'note', 'stage_change', 'assignment_change', 'followup_scheduled', 'whatsapp', 'email', 'status_change', 'enrolled')),
    title TEXT NOT NULL CHECK (char_length(trim(title)) >= 1),
    description TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Table 6: assignments (Lead Reassignment History)
CREATE TABLE IF NOT EXISTS assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    assigned_by UUID REFERENCES users(id) ON DELETE SET NULL,
    previous_owner_id UUID REFERENCES users(id) ON DELETE SET NULL,
    new_owner_id UUID REFERENCES users(id) ON DELETE SET NULL,
    reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Table 7: audit_logs (Immutable Audit Trail)
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action TEXT NOT NULL CHECK (action IN ('create', 'update', 'delete', 'reassign', 'status_change', 'export', 'login', 'document_upload', 'document_delete')),
    entity_type TEXT NOT NULL CHECK (entity_type IN ('lead', 'user', 'stage', 'settings', 'document', 'organization')),
    entity_id UUID NOT NULL,
    old_values JSONB,
    new_values JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Table 8: notifications (In-App Alerts)
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
    title TEXT NOT NULL CHECK (char_length(trim(title)) >= 1),
    message TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('reminder', 'assignment', 'alert', 'system', 'mention')),
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Table 9: email_templates (Saved Templates)
CREATE TABLE IF NOT EXISTS email_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    name TEXT NOT NULL CHECK (char_length(trim(name)) >= 1),
    subject TEXT NOT NULL CHECK (char_length(trim(subject)) >= 1),
    body TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'follow_up' CHECK (category IN ('follow_up', 'welcome', 'document_request', 'offer_letter', 'visa', 'other')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    deleted_at TIMESTAMPTZ,
    CONSTRAINT uq_email_templates_org_name UNIQUE (organization_id, name)
);

-- Table 10: lead_documents (Student Document Metadata)
CREATE TABLE IF NOT EXISTS lead_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
    file_name TEXT NOT NULL CHECK (char_length(trim(file_name)) >= 1),
    file_key TEXT NOT NULL,
    file_size_bytes BIGINT NOT NULL CHECK (file_size_bytes > 0 AND file_size_bytes <= 26214400),
    mime_type TEXT NOT NULL CHECK (mime_type IN ('application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')),
    document_type TEXT NOT NULL CHECK (document_type IN ('passport', 'transcript', 'ielts_toefl', 'sop', 'lor', 'visa', 'other')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    deleted_at TIMESTAMPTZ,
    CONSTRAINT uq_lead_documents_file_key UNIQUE (file_key)
);

-- Table 11: user_sessions (Counselor Presence Tracking)
CREATE TABLE IF NOT EXISTS user_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (status IN ('online', 'idle', 'offline')),
    started_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    ended_at TIMESTAMPTZ,
    duration_seconds INTEGER NOT NULL DEFAULT 0 CHECK (duration_seconds >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ============================================================================
-- 4. UPDATED_AT TRIGGERS
-- ============================================================================
DO $$
DECLARE
    tbl text;
BEGIN
    FOR tbl IN
        SELECT unnest(ARRAY['organizations', 'users', 'stages', 'leads', 'activities', 'assignments', 'audit_logs', 'notifications', 'email_templates', 'lead_documents', 'user_sessions'])
    LOOP
        EXECUTE format('
            DROP TRIGGER IF EXISTS trg_update_updated_at ON %I;
            CREATE TRIGGER trg_update_updated_at
            BEFORE UPDATE ON %I
            FOR EACH ROW
            EXECUTE FUNCTION update_updated_at_column();
        ', tbl, tbl);
    END LOOP;
END;
$$;

-- ============================================================================
-- 5. INDEXES
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_organizations_slug ON organizations (slug) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_users_org_id ON users (organization_id);
CREATE INDEX IF NOT EXISTS idx_users_auth_id ON users (auth_id) WHERE auth_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_org_role ON users (organization_id, role) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_users_org_status ON users (organization_id, status) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_stages_org_order ON stages (organization_id, display_order) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_leads_org_id ON leads (organization_id);
CREATE INDEX IF NOT EXISTS idx_leads_owner_id ON leads (owner_id) WHERE owner_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_stage_id ON leads (stage_id) WHERE stage_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_org_deleted ON leads (organization_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_leads_org_status ON leads (organization_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_leads_org_created_at ON leads (organization_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_leads_followup ON leads (organization_id, next_follow_up ASC) WHERE deleted_at IS NULL AND next_follow_up IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_phone ON leads (organization_id, phone);
CREATE INDEX IF NOT EXISTS idx_leads_email ON leads (organization_id, email) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_source ON leads (organization_id, source) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_activities_org_id ON activities (organization_id);
CREATE INDEX IF NOT EXISTS idx_activities_lead_created ON activities (lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activities_user_created ON activities (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activities_type ON activities (organization_id, type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_assignments_org_id ON assignments (organization_id);
CREATE INDEX IF NOT EXISTS idx_assignments_lead ON assignments (lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_assignments_new_owner ON assignments (new_owner_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_org_created ON audit_logs (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs (organization_id, entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs (organization_id, user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications (user_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_org_created ON notifications (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_lead ON notifications (lead_id) WHERE lead_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_email_templates_org_cat ON email_templates (organization_id, category) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_lead_documents_lead ON lead_documents (lead_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_lead_documents_org ON lead_documents (organization_id, created_at DESC) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions (user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_sessions_org_started ON user_sessions (organization_id, started_at DESC);

-- ============================================================================
-- 6. MULTI-TENANT ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Function to retrieve the current user's organization_id from auth context
CREATE OR REPLACE FUNCTION get_current_user_org_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT organization_id
    FROM users
    WHERE auth_id = auth.uid()
      AND deleted_at IS NULL
    LIMIT 1;
$$;

-- Enable RLS on all tenant-owned tables
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;

-- Organizations Policy: Users can only view their own organization
DROP POLICY IF EXISTS "tenant_isolation_organizations" ON organizations;
CREATE POLICY "tenant_isolation_organizations" ON organizations
    FOR ALL
    USING (id = get_current_user_org_id());

-- Users Policy: Users can only see team members in their organization
DROP POLICY IF EXISTS "tenant_isolation_users" ON users;
CREATE POLICY "tenant_isolation_users" ON users
    FOR ALL
    USING (organization_id = get_current_user_org_id())
    WITH CHECK (organization_id = get_current_user_org_id());

-- Leads Policy: Full isolation per organization
DROP POLICY IF EXISTS "tenant_isolation_leads" ON leads;
CREATE POLICY "tenant_isolation_leads" ON leads
    FOR ALL
    USING (organization_id = get_current_user_org_id())
    WITH CHECK (organization_id = get_current_user_org_id());

-- Stages Policy: Isolation per organization
DROP POLICY IF EXISTS "tenant_isolation_stages" ON stages;
CREATE POLICY "tenant_isolation_stages" ON stages
    FOR ALL
    USING (organization_id = get_current_user_org_id())
    WITH CHECK (organization_id = get_current_user_org_id());

-- Activities Policy: Isolation per organization
DROP POLICY IF EXISTS "tenant_isolation_activities" ON activities;
CREATE POLICY "tenant_isolation_activities" ON activities
    FOR ALL
    USING (organization_id = get_current_user_org_id())
    WITH CHECK (organization_id = get_current_user_org_id());

-- Assignments Policy: Isolation per organization
DROP POLICY IF EXISTS "tenant_isolation_assignments" ON assignments;
CREATE POLICY "tenant_isolation_assignments" ON assignments
    FOR ALL
    USING (organization_id = get_current_user_org_id())
    WITH CHECK (organization_id = get_current_user_org_id());

-- Audit Logs Policy: Read only for own org, insertable by system
DROP POLICY IF EXISTS "tenant_isolation_audit_logs" ON audit_logs;
CREATE POLICY "tenant_isolation_audit_logs" ON audit_logs
    FOR SELECT
    USING (organization_id = get_current_user_org_id());

DROP POLICY IF EXISTS "tenant_isolation_audit_logs_insert" ON audit_logs;
CREATE POLICY "tenant_isolation_audit_logs_insert" ON audit_logs
    FOR INSERT
    WITH CHECK (organization_id = get_current_user_org_id());

-- Notifications Policy: Scoped to recipient user & organization
DROP POLICY IF EXISTS "tenant_isolation_notifications" ON notifications;
CREATE POLICY "tenant_isolation_notifications" ON notifications
    FOR ALL
    USING (organization_id = get_current_user_org_id() AND user_id = auth.uid())
    WITH CHECK (organization_id = get_current_user_org_id());

-- Lead Documents Policy: Isolation per organization
DROP POLICY IF EXISTS "tenant_isolation_lead_documents" ON lead_documents;
CREATE POLICY "tenant_isolation_lead_documents" ON lead_documents
    FOR ALL
    USING (organization_id = get_current_user_org_id())
    WITH CHECK (organization_id = get_current_user_org_id());

-- User Sessions Policy: Isolation per organization
DROP POLICY IF EXISTS "tenant_isolation_user_sessions" ON user_sessions;
CREATE POLICY "tenant_isolation_user_sessions" ON user_sessions
    FOR ALL
    USING (organization_id = get_current_user_org_id())
    WITH CHECK (organization_id = get_current_user_org_id());
