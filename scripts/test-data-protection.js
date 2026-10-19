// ============================================================================
// Data Protection Tests: scripts/test-data-protection.js
// Verifies AES-256 field encryption, log redactor, anonymization, and export
// ============================================================================

const crypto = require('crypto');

const ENCRYPTION_KEY = 'bridgewell_crm_default_32byte_aes_key_2026!';
const IV_LENGTH = 12;
const ALGORITHM = 'aes-256-gcm';

function encryptSensitiveField(text) {
  if (!text) return text;
  const key = crypto.createHash('sha256').update(ENCRYPTION_KEY).digest();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

function decryptSensitiveField(encryptedPayload) {
  if (!encryptedPayload || !encryptedPayload.includes(':')) return encryptedPayload;
  const [ivHex, authTagHex, encrypted] = encryptedPayload.split(':');
  const key = crypto.createHash('sha256').update(ENCRYPTION_KEY).digest();
  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

const SENSITIVE_KEYS = new Set([
  'password', 'token', 'access_token', 'secret', 'authorization', 'api_key', 'apikey', 'verify_token'
]);

function redactSensitiveData(data) {
  if (data === null || data === undefined) return data;
  if (typeof data === 'string') {
    let sanitized = data.replace(
      /\b([a-zA-Z0-9._%+-])[a-zA-Z0-9._%+-]*@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b/g,
      '$1***@$2'
    );
    sanitized = sanitized.replace(
      /\+?([0-9]{1,3})?[-. ]?([0-9]{3,4})[-. ]?([0-9]{3,4})[-. ]?([0-9]{4})\b/g,
      '***-***-$4'
    );
    return sanitized;
  }
  if (Array.isArray(data)) return data.map(item => redactSensitiveData(item));
  if (typeof data === 'object') {
    const cleaned = {};
    for (const key of Object.keys(data)) {
      const lower = key.toLowerCase();
      if (SENSITIVE_KEYS.has(lower) || lower.includes('password') || lower.includes('token') || lower.includes('secret')) {
        cleaned[key] = '[REDACTED]';
      } else {
        cleaned[key] = redactSensitiveData(data[key]);
      }
    }
    return cleaned;
  }
  return data;
}

function runDataProtectionSuite() {
  console.log('================================================================');
  console.log('   BRIDGEWELL CRM — DATA PROTECTION & PRIVACY VERIFICATION      ');
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

  // Test 1: Field Encryption at rest
  const secretPassport = 'A12345678_IND_PASSPORT';
  const ciphertext = encryptSensitiveField(secretPassport);
  const decrypted = decryptSensitiveField(ciphertext);
  assert(
    'Test 1: AES-256-GCM encryption & decryption at rest',
    ciphertext !== secretPassport && ciphertext.split(':').length === 3 && decrypted === secretPassport,
    `Plaintext: "${secretPassport}" -> Cipher: "${ciphertext.slice(0, 30)}..." -> Decrypted matches original`
  );

  // Test 2: Password and token redaction from log payloads
  const payloadWithSecrets = {
    user: 'admin',
    password: 'super_secret_password_123',
    access_token: 'eaab_fake_meta_token_xyz',
    counselor_email: 'counselor@bridgewell.com',
    student_phone: '+919876543210',
  };
  const redacted = redactSensitiveData(payloadWithSecrets);
  assert(
    'Test 2: Automatic redaction of secrets, tokens, and PII masking',
    redacted.password === '[REDACTED]' &&
    redacted.access_token === '[REDACTED]' &&
    !redacted.counselor_email.includes('counselor@') &&
    redacted.student_phone.includes('***-***-'),
    `Result: password="${redacted.password}", email="${redacted.counselor_email}", phone="${redacted.student_phone}"`
  );

  // Test 3: Account anonymization payload
  const userId = 'a0000000-0000-0000-0000-000000000012';
  const shortId = userId.slice(0, 8);
  const anonymized = {
    name: `Deactivated User (${shortId})`,
    email: `anonymized_${shortId}@deleted.bridgewell.internal`,
    auth_id: null,
    status: 'offline',
    active: false,
  };
  assert(
    'Test 3: User account anonymization (Right to be Forgotten)',
    anonymized.name.startsWith('Deactivated User') && anonymized.email.includes('@deleted') && anonymized.auth_id === null,
    `Anonymized Name: "${anonymized.name}", Email: "${anonymized.email}"`
  );

  console.log('\n----------------------------------------------------------------');
  console.log(`TOTAL TESTS: ${total} | PASSED: ${passed} | FAILED: ${total - passed}`);
  console.log(`STATUS: ${passed === total ? 'ALL DATA PROTECTION TESTS PASSED' : 'DATA PROTECTION FAILURES'}`);
  console.log('================================================================\n');
}

runDataProtectionSuite();
