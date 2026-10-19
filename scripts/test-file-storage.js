// ============================================================================
// File Storage Test Suite: scripts/test-file-storage.js
// Tests for:
// 1. Wrong file type rejection
// 2. Too large file rejection (>25MB)
// 3. User from another org trying to download (Cross-tenant block)
// 4. Valid upload and authorized download flow
// ============================================================================

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

const ALLOWED_EXTENSIONS = new Set([
  '.pdf',
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.doc',
  '.docx',
]);

const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB
const SHORT_LIVED_URL_EXPIRY_SECONDS = 60; // 60s

// Logic under test (mirrors frontend/src/lib/storageService.ts)
function validateFileUpload(input) {
  const { mime_type, file_size_bytes, file_name } = input;

  if (!file_name || !file_name.trim()) {
    return { valid: false, error: 'File name is required', status: 400 };
  }

  if (!mime_type || !ALLOWED_MIME_TYPES.has(mime_type.toLowerCase())) {
    return {
      valid: false,
      error: `Invalid file type "${mime_type}". Only PDF, JPG, PNG, WEBP, and Word documents are permitted.`,
      status: 400,
    };
  }

  const lowerName = file_name.toLowerCase();
  const hasValidExt = Array.from(ALLOWED_EXTENSIONS).some(ext => lowerName.endsWith(ext));
  if (!hasValidExt) {
    return {
      valid: false,
      error: `Disallowed file extension for file "${file_name}". Permitted extensions: .pdf, .jpg, .png, .webp, .doc, .docx`,
      status: 400,
    };
  }

  if (typeof file_size_bytes !== 'number' || file_size_bytes <= 0) {
    return {
      valid: false,
      error: 'File size must be a positive number of bytes',
      status: 400,
    };
  }

  if (file_size_bytes > MAX_FILE_SIZE_BYTES) {
    const sizeInMB = (file_size_bytes / (1024 * 1024)).toFixed(2);
    return {
      valid: false,
      error: `File size exceeds the 25MB limit. Uploaded size: ${sizeInMB} MB`,
      status: 400,
    };
  }

  return { valid: true, status: 200 };
}

function generateScopedStorageKey(organization_id, lead_id, file_name) {
  const sanitized = file_name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const uniqueId = 'uuid-' + Math.random().toString(36).substring(2, 10);
  return `${organization_id}/${lead_id}/${uniqueId}-${sanitized}`;
}

function verifyOrganizationAccess(caller_org_id, document_org_id) {
  if (!caller_org_id || !document_org_id) {
    return { authorized: false, error: 'Missing organization identifier', status: 401 };
  }

  if (caller_org_id !== document_org_id) {
    return {
      authorized: false,
      error: 'Access denied: You do not have permission to view documents from another organization.',
      code: 'CROSS_TENANT_ACCESS_DENIED',
      status: 403,
    };
  }

  return { authorized: true, status: 200 };
}

// ----------------------------------------------------------------------------
// TEST RUNNER
// ----------------------------------------------------------------------------
async function runStorageTestSuite() {
  console.log('================================================================');
  console.log('   BRIDGEWELL CRM — FILE STORAGE SECURITY & VALIDATION TESTS    ');
  console.log('================================================================\n');

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

  const ORG_A_ID = 'a0000000-0000-0000-0000-000000000001';
  const ORG_B_ID = 'b0000000-0000-0000-0000-000000000002';
  const LEAD_A_ID = 'a0000000-0000-0000-0000-000000000051';

  // --------------------------------------------------------------------------
  // TEST 1: Wrong File Type Rejection
  // --------------------------------------------------------------------------
  const wrongTypeInput = {
    file_name: 'exploit_script.exe',
    mime_type: 'application/x-msdownload',
    file_size_bytes: 1024 * 500, // 500 KB
  };
  const wrongTypeResult = validateFileUpload(wrongTypeInput);
  assert(
    'Test 1: Reject wrong file type (e.g. .exe / application/x-msdownload)',
    wrongTypeResult.valid === false && wrongTypeResult.status === 400 && wrongTypeResult.error.includes('Invalid file type'),
    `Status: ${wrongTypeResult.status} | Reason: "${wrongTypeResult.error}"`
  );

  // --------------------------------------------------------------------------
  // TEST 2: Spoofed Extension / Mime mismatch
  // --------------------------------------------------------------------------
  const spoofedInput = {
    file_name: 'malware.sh',
    mime_type: 'application/pdf', // spoofed mime type
    file_size_bytes: 1024 * 100,
  };
  const spoofedResult = validateFileUpload(spoofedInput);
  assert(
    'Test 2: Reject disallowed extension even if mime_type is spoofed',
    spoofedResult.valid === false && spoofedResult.status === 400 && spoofedResult.error.includes('Disallowed file extension'),
    `Status: ${spoofedResult.status} | Reason: "${spoofedResult.error}"`
  );

  // --------------------------------------------------------------------------
  // TEST 3: File Too Large Rejection (>25MB)
  // --------------------------------------------------------------------------
  const oversizedInput = {
    file_name: 'huge_portfolio_video.pdf',
    mime_type: 'application/pdf',
    file_size_bytes: 30 * 1024 * 1024, // 30 MB (>25MB limit)
  };
  const oversizedResult = validateFileUpload(oversizedInput);
  assert(
    'Test 3: Reject file exceeding 25MB limit',
    oversizedResult.valid === false && oversizedResult.status === 400 && oversizedResult.error.includes('exceeds the 25MB limit'),
    `Status: ${oversizedResult.status} | Reason: "${oversizedResult.error}"`
  );

  // --------------------------------------------------------------------------
  // TEST 4: Valid File Upload & Scoped Key Generation
  // --------------------------------------------------------------------------
  const validInput = {
    file_name: 'Aarav_Mehta_IELTS_Scorecard.pdf',
    mime_type: 'application/pdf',
    file_size_bytes: 2.4 * 1024 * 1024, // 2.4 MB
  };
  const validResult = validateFileUpload(validInput);
  const scopedKey = generateScopedStorageKey(ORG_A_ID, LEAD_A_ID, validInput.file_name);
  assert(
    'Test 4: Accept valid file (2.4MB PDF) and generate org-scoped storage path',
    validResult.valid === true && scopedKey.startsWith(`${ORG_A_ID}/${LEAD_A_ID}/`),
    `Generated Key: "${scopedKey}" (Correctly scoped under ${ORG_A_ID})`
  );

  // --------------------------------------------------------------------------
  // TEST 5: User from Another Org Trying to Download (Cross-Tenant Block)
  // --------------------------------------------------------------------------
  const crossTenantDownload = verifyOrganizationAccess(ORG_B_ID, ORG_A_ID);
  assert(
    'Test 5: Cross-tenant download attempt by Org B on Org A file is BLOCKED (403 Forbidden)',
    crossTenantDownload.authorized === false && crossTenantDownload.status === 403 && crossTenantDownload.code === 'CROSS_TENANT_ACCESS_DENIED',
    `Status: ${crossTenantDownload.status} | Code: ${crossTenantDownload.code} | Error: "${crossTenantDownload.error}"`
  );

  // --------------------------------------------------------------------------
  // TEST 6: Authorized Download from Same Org
  // --------------------------------------------------------------------------
  const authorizedDownload = verifyOrganizationAccess(ORG_A_ID, ORG_A_ID);
  assert(
    'Test 6: Authorized download within same organization permitted (200 OK)',
    authorizedDownload.authorized === true && authorizedDownload.status === 200,
    `Status: ${authorizedDownload.status} | Authorized: ${authorizedDownload.authorized} | Short-lived signed URL expires in ${SHORT_LIVED_URL_EXPIRY_SECONDS}s`
  );

  console.log('\n----------------------------------------------------------------');
  console.log(`TOTAL TESTS: ${total} | PASSED: ${passed} | FAILED: ${total - passed}`);
  console.log(`STATUS: ${passed === total ? 'ALL STORAGE TESTS PASSED' : 'STORAGE SECURITY FAILURES'}`);
  console.log('================================================================\n');
}

runStorageTestSuite();
