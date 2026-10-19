-- ============================================================================
-- Seed Data: supabase/seed.sql
-- Description: Multi-tenant realistic test data for 2 Organizations x 3 Users
-- Tests tenant isolation: apex-edu vs beacon-overseas
-- ============================================================================

-- Clean existing seed data (if any)
DELETE FROM organizations WHERE slug IN ('apex-edu', 'beacon-overseas');

-- ----------------------------------------------------------------------------
-- 1. ORGANIZATIONS
-- ----------------------------------------------------------------------------
INSERT INTO organizations (id, name, slug) VALUES
('a0000000-0000-0000-0000-000000000001', 'Apex Study Abroad Global', 'apex-edu'),
('b0000000-0000-0000-0000-000000000002', 'Beacon Overseas Admissions', 'beacon-overseas');

-- ----------------------------------------------------------------------------
-- 2. USERS (3 per organization)
-- ----------------------------------------------------------------------------
-- Org 1 Users (Apex)
INSERT INTO users (id, organization_id, name, email, role, status) VALUES
('a0000000-0000-0000-0000-000000000011', 'a0000000-0000-0000-0000-000000000001', 'Priya Sharma', 'priya@apexedu.com', 'admin', 'online'),
('a0000000-0000-0000-0000-000000000012', 'a0000000-0000-0000-0000-000000000001', 'Rahul Verma', 'rahul@apexedu.com', 'counselor', 'online'),
('a0000000-0000-0000-0000-000000000013', 'a0000000-0000-0000-0000-000000000001', 'Ananya Sen', 'ananya@apexedu.com', 'counselor', 'idle');

-- Org 2 Users (Beacon)
INSERT INTO users (id, organization_id, name, email, role, status) VALUES
('b0000000-0000-0000-0000-000000000021', 'b0000000-0000-0000-0000-000000000002', 'David Wilson', 'david@beaconadmit.com', 'admin', 'online'),
('b0000000-0000-0000-0000-000000000022', 'b0000000-0000-0000-0000-000000000002', 'Sarah Miller', 'sarah@beaconadmit.com', 'counselor', 'online'),
('b0000000-0000-0000-0000-000000000023', 'b0000000-0000-0000-0000-000000000002', 'James Chen', 'james@beaconadmit.com', 'counselor', 'offline');

-- ----------------------------------------------------------------------------
-- 3. STAGES
-- ----------------------------------------------------------------------------
-- Org 1 Stages
INSERT INTO stages (id, organization_id, name, slug, color, display_order, is_terminal) VALUES
('a0000000-0000-0000-0000-000000000031', 'a0000000-0000-0000-0000-000000000001', 'New Lead', 'new_lead', '#3b82f6', 1, false),
('a0000000-0000-0000-0000-000000000032', 'a0000000-0000-0000-0000-000000000001', 'Counseling Call', 'counseling_call', '#8b5cf6', 2, false),
('a0000000-0000-0000-0000-000000000033', 'a0000000-0000-0000-0000-000000000001', 'Documents Collected', 'docs_collected', '#f59e0b', 3, false),
('a0000000-0000-0000-0000-000000000034', 'a0000000-0000-0000-0000-000000000001', 'Enrolled & Paid', 'enrolled', '#10b981', 4, true);

-- Org 2 Stages
INSERT INTO stages (id, organization_id, name, slug, color, display_order, is_terminal) VALUES
('b0000000-0000-0000-0000-000000000041', 'b0000000-0000-0000-0000-000000000002', 'Inbound Inquiry', 'inbound_inquiry', '#06b6d4', 1, false),
('b0000000-0000-0000-0000-000000000042', 'b0000000-0000-0000-0000-000000000002', 'University Shortlisting', 'shortlisting', '#ec4899', 2, false),
('b0000000-0000-0000-0000-000000000043', 'b0000000-0000-0000-0000-000000000002', 'Offer Accepted', 'offer_accepted', '#10b981', 3, true);

-- ----------------------------------------------------------------------------
-- 4. LEADS (Sample Students with budget in minor units)
-- ----------------------------------------------------------------------------
-- Org 1 Leads
INSERT INTO leads (id, organization_id, owner_id, stage_id, name, email, phone, course_interest, country_preference, source, status, budget_minor, currency, priority, next_follow_up) VALUES
('a0000000-0000-0000-0000-000000000051', 'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000012', 'a0000000-0000-0000-0000-000000000032', 'Aarav Mehta', 'aarav.mehta@example.com', '+919876543210', 'MS Computer Science', 'Canada', 'meta_ads', 'interested', 250000000, 'INR', 'high', now() + interval '2 hours'),
('a0000000-0000-0000-0000-000000000052', 'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000013', 'a0000000-0000-0000-0000-000000000033', 'Simran Kaur', 'simran.kaur@example.com', '+919876543211', 'MBA Global Marketing', 'UK', 'website', 'meeting_scheduled', 350000000, 'INR', 'urgent', now() + interval '1 day'),
('a0000000-0000-0000-0000-000000000053', 'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000012', 'a0000000-0000-0000-0000-000000000034', 'Rohan Gupta', 'rohan.gupta@example.com', '+919876543212', 'Bachelors Cybersecurity', 'Australia', 'referral', 'enrolled', 420000000, 'INR', 'medium', null);

-- Org 2 Leads
INSERT INTO leads (id, organization_id, owner_id, stage_id, name, email, phone, course_interest, country_preference, source, status, budget_minor, currency, priority, next_follow_up) VALUES
('b0000000-0000-0000-0000-000000000061', 'b0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000022', 'b0000000-0000-0000-0000-000000000041', 'Emily Brown', 'emily.brown@example.com', '+14155552671', 'MSc Renewable Energy', 'Germany', 'meta_ads', 'new', 180000000, 'EUR', 'high', now() + interval '3 hours'),
('b0000000-0000-0000-0000-000000000062', 'b0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000023', 'b0000000-0000-0000-0000-000000000042', 'Lucas Taylor', 'lucas.taylor@example.com', '+14155559812', 'BS Artificial Intelligence', 'USA', 'website', 'contacted', 450000000, 'USD', 'urgent', now() + interval '4 hours'),
('b0000000-0000-0000-0000-000000000063', 'b0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000022', 'b0000000-0000-0000-0000-000000000043', 'Chloe Martin', 'chloe.martin@example.com', '+14155554421', 'MSc Data Science', 'Ireland', 'walk_in', 'enrolled', 280000000, 'EUR', 'medium', null);

-- ----------------------------------------------------------------------------
-- 5. ACTIVITIES (Timeline)
-- ----------------------------------------------------------------------------
INSERT INTO activities (id, organization_id, lead_id, user_id, type, title, description) VALUES
('a0000000-0000-0000-0000-000000000071', 'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000051', 'a0000000-0000-0000-0000-000000000012', 'call', 'Initial Intake Counseling Call', 'Student interested in Fall 2027 intake in Ontario/BC. IELTS score is 7.5.'),
('b0000000-0000-0000-0000-000000000081', 'b0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000061', 'b0000000-0000-0000-0000-000000000022', 'call', 'Lead qualification call', 'Candidate interested in TU Munich or RWTH Aachen. Preparing transcript submission.');

-- ----------------------------------------------------------------------------
-- 6. AUDIT LOGS
-- ----------------------------------------------------------------------------
INSERT INTO audit_logs (organization_id, user_id, action, entity_type, entity_id, new_values) VALUES
('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000011', 'create', 'lead', 'a0000000-0000-0000-0000-000000000051', '{"name": "Aarav Mehta", "status": "interested"}'::jsonb),
('b0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000021', 'create', 'lead', 'b0000000-0000-0000-0000-000000000061', '{"name": "Emily Brown", "status": "new"}'::jsonb);
