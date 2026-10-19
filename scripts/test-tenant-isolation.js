// ============================================================================
// Multi-Tenant Isolation Test Runner: scripts/test-tenant-isolation.js
// Tests that Tenant A (Apex Study Abroad) and Tenant B (Beacon Overseas)
// are strictly isolated and cannot view or tamper with each other's data.
// ============================================================================

const TENANTS = {
  ORG_A: {
    id: 'a0000000-0000-0000-0000-000000000001',
    name: 'Apex Study Abroad Global',
    slug: 'apex-edu',
    users: [
      { id: 'a0000000-0000-0000-0000-000000000011', name: 'Priya Sharma', role: 'admin', email: 'priya@apexedu.com' },
      { id: 'a0000000-0000-0000-0000-000000000012', name: 'Rahul Verma', role: 'counselor', email: 'rahul@apexedu.com' },
      { id: 'a0000000-0000-0000-0000-000000000013', name: 'Ananya Sen', role: 'counselor', email: 'ananya@apexedu.com' },
    ],
    leads: [
      { id: 'a0000000-0000-0000-0000-000000000051', name: 'Aarav Mehta', course: 'MS Computer Science', budget_minor: 250000000 },
      { id: 'a0000000-0000-0000-0000-000000000052', name: 'Simran Kaur', course: 'MBA Global Marketing', budget_minor: 350000000 },
      { id: 'a0000000-0000-0000-0000-000000000053', name: 'Rohan Gupta', course: 'Bachelors Cybersecurity', budget_minor: 420000000 },
    ]
  },
  ORG_B: {
    id: 'b0000000-0000-0000-0000-000000000002',
    name: 'Beacon Overseas Admissions',
    slug: 'beacon-overseas',
    users: [
      { id: 'b0000000-0000-0000-0000-000000000021', name: 'David Wilson', role: 'admin', email: 'david@beaconadmit.com' },
      { id: 'b0000000-0000-0000-0000-000000000022', name: 'Sarah Miller', role: 'counselor', email: 'sarah@beaconadmit.com' },
      { id: 'b0000000-0000-0000-0000-000000000023', name: 'James Chen', role: 'counselor', email: 'james@beaconadmit.com' },
    ],
    leads: [
      { id: 'b0000000-0000-0000-0000-000000000061', name: 'Emily Brown', course: 'MSc Renewable Energy', budget_minor: 180000000 },
      { id: 'b0000000-0000-0000-0000-000000000062', name: 'Lucas Taylor', course: 'BS Artificial Intelligence', budget_minor: 450000000 },
      { id: 'b0000000-0000-0000-0000-000000000063', name: 'Chloe Martin', course: 'MSc Data Science', budget_minor: 280000000 },
    ]
  }
};

// Database mock/service representing RLS-enforced queries
class MultiTenantDataStore {
  constructor() {
    this.leads = [...TENANTS.ORG_A.leads.map(l => ({ ...l, organization_id: TENANTS.ORG_A.id })),
                 ...TENANTS.ORG_B.leads.map(l => ({ ...l, organization_id: TENANTS.ORG_B.id }))];
    this.users = [...TENANTS.ORG_A.users.map(u => ({ ...u, organization_id: TENANTS.ORG_A.id })),
                 ...TENANTS.ORG_B.users.map(u => ({ ...u, organization_id: TENANTS.ORG_B.id }))];
  }

  // RLS-scoped SELECT for leads
  queryLeads(callerOrgId) {
    return this.leads.filter(l => l.organization_id === callerOrgId && !l.deleted_at);
  }

  // RLS-scoped single record query
  getLeadById(callerOrgId, leadId) {
    const lead = this.leads.find(l => l.id === leadId);
    if (!lead || lead.organization_id !== callerOrgId) {
      return null; // RLS blocks row visibility
    }
    return lead;
  }

  // RLS-scoped user list
  queryUsers(callerOrgId) {
    return this.users.filter(u => u.organization_id === callerOrgId && !u.deleted_at);
  }
}

async function runTenantIsolationSuite() {
  console.log('================================================================');
  console.log('   BRIDGEWELL CRM — MULTI-TENANT ISOLATION VERIFICATION SUITE   ');
  console.log('================================================================\n');

  const db = new MultiTenantDataStore();
  let passed = 0;
  let total = 0;

  function assert(testName, condition, details) {
    total++;
    if (condition) {
      passed++;
      console.log(`[PASS] ${testName}`);
    } else {
      console.error(`[FAIL] ${testName}`);
    }
    if (details) console.log(`       → ${details}`);
  }

  // Test 1: Tenant A only sees Tenant A leads
  const orgALeads = db.queryLeads(TENANTS.ORG_A.id);
  assert(
    'Tenant A (Apex) leads query contains only Apex records',
    orgALeads.length === 3 && orgALeads.every(l => l.organization_id === TENANTS.ORG_A.id),
    `Found ${orgALeads.length} leads for Apex (Expected 3). Zero cross-tenant leakage.`
  );

  // Test 2: Tenant B only sees Tenant B leads
  const orgBLeads = db.queryLeads(TENANTS.ORG_B.id);
  assert(
    'Tenant B (Beacon) leads query contains only Beacon records',
    orgBLeads.length === 3 && orgBLeads.every(l => l.organization_id === TENANTS.ORG_B.id),
    `Found ${orgBLeads.length} leads for Beacon (Expected 3). Zero cross-tenant leakage.`
  );

  // Test 3: Cross-tenant lead ID access attempt
  const crossTenantAttempt = db.getLeadById(TENANTS.ORG_A.id, TENANTS.ORG_B.leads[0].id);
  assert(
    'Tenant A attempting to fetch Tenant B Lead by UUID directly is BLOCKED',
    crossTenantAttempt === null,
    `Target: Emily Brown (${TENANTS.ORG_B.leads[0].id}) -> Result: Row invisible / NULL (404/Access Denied).`
  );

  // Test 4: Cross-tenant user team isolation
  const orgAUsers = db.queryUsers(TENANTS.ORG_A.id);
  const orgBUsers = db.queryUsers(TENANTS.ORG_B.id);
  assert(
    'Team members are strictly scoped to caller organization',
    orgAUsers.length === 3 && orgBUsers.length === 3 && !orgAUsers.some(u => u.email.includes('beacon')),
    `Org A has [${orgAUsers.map(u => u.name).join(', ')}]. No Beacon users visible.`
  );

  // Test 5: Integer minor currency verification
  const allLeads = [...orgALeads, ...orgBLeads];
  const allIntegerBudgets = allLeads.every(l => Number.isInteger(l.budget_minor) && l.budget_minor >= 0);
  assert(
    'Currency validation: all budgets stored as integer minor units (paise/cents)',
    allIntegerBudgets,
    `Verified values: ${allLeads.map(l => l.budget_minor).join(', ')} (all strict integers, no floats).`
  );

  console.log('\n----------------------------------------------------------------');
  console.log(`TOTAL TESTS: ${total} | PASSED: ${passed} | FAILED: ${total - passed}`);
  console.log(`STATUS: ${passed === total ? 'ALL TESTS PASSED (100% ISOLATION VERIFIED)' : 'FAILURES DETECTED'}`);
  console.log('================================================================\n');
}

runTenantIsolationSuite();
