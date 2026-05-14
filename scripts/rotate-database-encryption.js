#!/usr/bin/env node

/**
 * rotate-database-encryption.js
 * 
 * Standalone administrative utility to securely rotate the symmetric AES-256-GCM
 * database encryption key across all persistent storage columns in the `users` table.
 * 
 * Execution Model:
 * Runs entirely offline/concurrently as an Admin-Initiated operation using standard
 * Supabase client API connections. Zero modifications to live application source code required.
 * 
 * Usage:
 *   SUPABASE_URL=https://... \
 *   SUPABASE_SECRET_KEY=sb_secret_... \
 *   OLD_ENCRYPTION_KEY=64hex... \
 *   NEW_ENCRYPTION_KEY=64hex... \
 *   node scripts/rotate-database-encryption.js
 */

const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const colors = {
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
  reset: '\x1b[0m',
  bold: '\x1b[1m',
};

// Validates input pattern matching exactly 64 hexadecimal characters
const KEY_PATTERN = /^[a-f0-9]{64}$/i;
const IV_PATTERN = /^[a-f0-9]{24}$/i;
const ALGORITHM = 'aes-256-gcm';

// Symmetrically encrypted schema companion definitions
const SENSITIVE_COLUMNS = [
  { contentCol: 'ezygo_token', ivCol: 'ezygo_iv' },
  { contentCol: 'auth_password', ivCol: 'auth_password_iv' },
  { contentCol: 'phone', ivCol: 'phone_iv' },
  { contentCol: 'gender', ivCol: 'gender_iv' },
  { contentCol: 'birth_date', ivCol: 'birth_date_iv' },
];

function printHeader() {
  console.log(`\n${colors.bold}${colors.cyan}=====================================================================${colors.reset}`);
  console.log(`${colors.bold}       GhostClass Standalone Database Encryption Key Rotator       ${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}=====================================================================${colors.reset}\n`);
}

function printUsageAndExit(errorMessage) {
  printHeader();
  if (errorMessage) {
    console.error(`${colors.red}❌ Error: ${errorMessage}${colors.reset}\n`);
  }
  console.log(`${colors.yellow}Required Environment Variables:${colors.reset}`);
  console.log(`  ${colors.bold}SUPABASE_URL${colors.reset}         → Real production Supabase URL (https://*.supabase.co)`);
  console.log(`  ${colors.bold}SUPABASE_SECRET_KEY${colors.reset}  → Supabase Service Role Secret Key (sb_secret_*)`);
  console.log(`  ${colors.bold}OLD_ENCRYPTION_KEY${colors.reset}   → Outgoing 64-hex symmetric encryption key`);
  console.log(`  ${colors.bold}NEW_ENCRYPTION_KEY${colors.reset}   → Newly generated 64-hex symmetric encryption key\n`);
  console.log(`${colors.cyan}Example Usage:${colors.reset}`);
  console.log(`  SUPABASE_URL=https://xyz.supabase.co \\`);
  console.log(`  SUPABASE_SECRET_KEY=sb_secret_123... \\`);
  console.log(`  OLD_ENCRYPTION_KEY=313faee... \\`);
  console.log(`  NEW_ENCRYPTION_KEY=abcdef1... \\`);
  console.log(`  node scripts/rotate-database-encryption.js\n`);
  process.exit(1);
}

function validateEnvironment() {
  const { SUPABASE_URL, SUPABASE_SECRET_KEY, OLD_ENCRYPTION_KEY, NEW_ENCRYPTION_KEY } = process.env;

  if (!SUPABASE_URL || !SUPABASE_URL.startsWith('https://')) {
    printUsageAndExit('Missing or invalid SUPABASE_URL');
  }
  if (!SUPABASE_SECRET_KEY) {
    printUsageAndExit('Missing SUPABASE_SECRET_KEY');
  }
  if (!OLD_ENCRYPTION_KEY || !KEY_PATTERN.test(OLD_ENCRYPTION_KEY)) {
    printUsageAndExit('OLD_ENCRYPTION_KEY must be exactly 64 hexadecimal characters');
  }
  if (!NEW_ENCRYPTION_KEY || !KEY_PATTERN.test(NEW_ENCRYPTION_KEY)) {
    printUsageAndExit('NEW_ENCRYPTION_KEY must be exactly 64 hexadecimal characters');
  }
  if (OLD_ENCRYPTION_KEY.toLowerCase() === NEW_ENCRYPTION_KEY.toLowerCase()) {
    printUsageAndExit('NEW_ENCRYPTION_KEY must differ from OLD_ENCRYPTION_KEY');
  }

  return {
    supabaseUrl: SUPABASE_URL,
    supabaseKey: SUPABASE_SECRET_KEY,
    oldKeyBuffer: Buffer.from(OLD_ENCRYPTION_KEY, 'hex'),
    newKeyBuffer: Buffer.from(NEW_ENCRYPTION_KEY, 'hex'),
  };
}

/**
 * Clean AES-256-GCM decryption module matching app payload parameters exactly.
 */
function decryptPayload(ivHex, contentString, keyBuffer) {
  if (!ivHex || !contentString) {
    throw new Error('Missing companion parameters');
  }
  if (!IV_PATTERN.test(ivHex)) {
    throw new Error('Malformed Initialisation Vector pattern');
  }
  const parts = contentString.split(':');
  if (parts.length !== 2) {
    throw new Error('Malformed content delimiter payload');
  }
  const [authTagHex, encryptedHex] = parts;
  if (authTagHex.length !== 32) {
    throw new Error('Malformed authentication tag buffer length');
  }

  const decipher = crypto.createDecipheriv(ALGORITHM, keyBuffer, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
  let plaintext = decipher.update(encryptedHex, 'hex', 'utf8');
  plaintext += decipher.final('utf8');
  return plaintext;
}

/**
 * Clean AES-256-GCM encryption module packaging distinct 96-bit Initialisation Vectors.
 */
function encryptPayload(plaintextString, keyBuffer) {
  const ivBuffer = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, keyBuffer, ivBuffer);
  let ciphertextHex = cipher.update(plaintextString, 'utf8', 'hex');
  ciphertextHex += cipher.final('hex');
  const authTagHex = cipher.getAuthTag().toString('hex');

  return {
    iv: ivBuffer.toString('hex'),
    content: `${authTagHex}:${ciphertextHex}`,
  };
}

/**
 * Processes a single database record, mapping out column updates safely.
 */
function processUserRecord(userRow, oldKeyBuffer, newKeyBuffer, stats) {
  const updatesMap = new Map();
  // Using Map reading dynamic keys prevents variable assigned to object injection sink warnings
  const rowMap = new Map(Object.entries(userRow));
  let modified = false;

  for (const { contentCol, ivCol } of SENSITIVE_COLUMNS) {
    const ivVal = rowMap.get(ivCol);
    const contentVal = rowMap.get(contentCol);

    // Skip unpopulated fields entirely
    if (!ivVal || !contentVal) {
      continue;
    }

    stats.totalFieldsEncountered += 1;

    let plaintext = null;

    // Attempt decryption using the legacy outgoing key
    try {
      plaintext = decryptPayload(ivVal, contentVal, oldKeyBuffer);
      stats.fieldsDecryptedSuccessfully += 1;
    } catch {
      // Defense-in-depth resilience check: verify if the row was already migrated in a previous run
      try {
        decryptPayload(ivVal, contentVal, newKeyBuffer);
        stats.fieldsAlreadyUpgraded += 1;
        continue;
      } catch (fallbackErr) {
        stats.fieldsFailedDecryption += 1;
        console.warn(`${colors.yellow}⚠️ Warning: Record ID ${userRow.id} column '${contentCol}' failed decoding under both keys: ${fallbackErr.message}. Skipping.${colors.reset}`);
        continue;
      }
    }

    // Re-encrypt the resolved plaintext using the fresh master key
    if (plaintext !== null) {
      const encryptedBundle = encryptPayload(plaintext, newKeyBuffer);
      updatesMap.set(ivCol, encryptedBundle.iv);
      updatesMap.set(contentCol, encryptedBundle.content);
      modified = true;
      stats.fieldsReEncrypted += 1;
    }
  }

  // Convert Map cleanly back to standard update schema mapping
  return { modified, updates: Object.fromEntries(updatesMap) };
}

/**
 * Iterates through a fetched chunk of user records to execute transactional key upgrades.
 */
async function processUsersBatch(usersBatch, supabase, env, stats) {
  for (const userRow of usersBatch) {
    stats.totalRowsTraversed += 1;
    const { modified, updates } = processUserRecord(userRow, env.oldKeyBuffer, env.newKeyBuffer, stats);

    if (modified) {
      // Execute an atomic transaction update pushing fresh Initialisation Vectors and ciphertext
      const { error: updateError } = await supabase
        .from('users')
        .update(updates)
        .eq('id', userRow.id);

      if (updateError) {
        console.error(`${colors.red}❌ Failed persisting updates for Record ID ${userRow.id}: ${updateError.message}${colors.reset}`);
      } else {
        stats.rowsModified += 1;
      }
    }
  }
}

/**
 * Orchestrates batch database table traversal and upgrading routines.
 */
async function executeRotation() {
  printHeader();
  const env = validateEnvironment();

  console.log(`${colors.green}✓ Credentials validated successfully.${colors.reset}`);
  console.log(`Connecting to Supabase instance at: ${colors.cyan}${env.supabaseUrl}${colors.reset} ...\n`);

  const supabase = createClient(env.supabaseUrl, env.supabaseKey, {
    auth: { persistSession: false },
  });

  const stats = {
    totalRowsTraversed: 0,
    rowsModified: 0,
    totalFieldsEncountered: 0,
    fieldsDecryptedSuccessfully: 0,
    fieldsReEncrypted: 0,
    fieldsAlreadyUpgraded: 0,
    fieldsFailedDecryption: 0,
  };

  const limit = 100;
  let offset = 0;
  let hasMoreRecords = true;

  console.log(`${colors.bold}Commencing systematic database record inspection...${colors.reset}\n`);

  while (hasMoreRecords) {
    const { data: usersBatch, error: fetchError } = await supabase
      .from('users')
      .select('*')
      .order('id', { ascending: true })
      .range(offset, offset + limit - 1);

    if (fetchError) {
      console.error(`${colors.red}❌ Critical database traversal abort: ${fetchError.message}${colors.reset}`);
      process.exit(1);
    }

    if (!usersBatch || usersBatch.length === 0) {
      break;
    }

    await processUsersBatch(usersBatch, supabase, env, stats);

    offset += usersBatch.length;
    process.stdout.write(`  Processed rows: ${colors.bold}${stats.totalRowsTraversed}${colors.reset} | Upgraded rows: ${colors.bold}${colors.green}${stats.rowsModified}${colors.reset}\r`);

    // Terminate range scan if incoming batch size falls below request threshold
    if (usersBatch.length < limit) {
      hasMoreRecords = false;
    }
  }

  console.log(`\n\n${colors.bold}${colors.green}✔ Database Bulk Encryption Key Rotation finalized successfully.${colors.reset}\n`);
  console.log(`${colors.cyan}Execution Summary Statistics:${colors.reset}`);
  console.log(`  Total User Rows Scanned       : ${colors.bold}${stats.totalRowsTraversed}${colors.reset}`);
  console.log(`  User Rows Successfully Upgraded: ${colors.bold}${colors.green}${stats.rowsModified}${colors.reset}`);
  console.log(`  Total Symmetrical Fields Found: ${colors.bold}${stats.totalFieldsEncountered}${colors.reset}`);
  console.log(`  Fields Decoded & Re-encrypted : ${colors.bold}${colors.green}${stats.fieldsReEncrypted}${colors.reset}`);
  console.log(`  Fields Pre-migrated / Skipped : ${colors.bold}${colors.yellow}${stats.fieldsAlreadyUpgraded}${colors.reset}`);
  if (stats.fieldsFailedDecryption > 0) {
    console.log(`  Fields Errored / Unresolved   : ${colors.bold}${colors.red}${stats.fieldsFailedDecryption}${colors.reset}`);
  }
  console.log(`\n${colors.bold}${colors.yellow}Next Action Required:${colors.reset}`);
  console.log(`Update ${colors.bold}ENCRYPTION_KEY${colors.reset} inside your Infisical Dashboard \`/runtime\` folder to the new key string`);
  console.log(`and restart your production container so the Infisical CLI wrapper injects the fresh key at boot.\n`);
}

// Ensure execution safety by scoping promises securely
if (require.main === module) {
  executeRotation().catch((err) => {
    console.error(`\n${colors.red}❌ Fatal runtime script error: ${err.stack || err.message}${colors.reset}`);
    process.exit(1);
  });
}
