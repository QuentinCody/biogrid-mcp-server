#!/usr/bin/env node
// interlinked-tdd: exempt

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_ROOT = path.resolve(__dirname, '..');

const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const BLUE = '\x1b[34m';
const RESET = '\x1b[0m';

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assertContains(filePath, haystack, needle, testName) {
  totalTests++;
  if (haystack.includes(needle)) {
    console.log(`${GREEN}✓${RESET} ${testName}`);
    passedTests++;
  } else {
    console.log(`${RED}✗${RESET} ${testName}`);
    console.log(`  Missing: ${needle}`);
    console.log(`  File: ${filePath}`);
    failedTests++;
  }
}

function assertMissing(filePath, haystack, needle, testName) {
  totalTests++;
  if (!haystack.includes(needle)) {
    console.log(`${GREEN}✓${RESET} ${testName}`);
    passedTests++;
  } else {
    console.log(`${RED}✗${RESET} ${testName}`);
    console.log(`  Should NOT contain: ${needle}`);
    console.log(`  File: ${filePath}`);
    failedTests++;
  }
}

function assertTrue(condition, testName, detail) {
  totalTests++;
  if (condition) {
    console.log(`${GREEN}✓${RESET} ${testName}`);
    passedTests++;
  } else {
    console.log(`${RED}✗${RESET} ${testName}`);
    if (detail !== undefined) console.log(`  Got: ${detail}`);
    failedTests++;
  }
}

function readFile(relPath) {
  const absPath = path.resolve(SERVER_ROOT, relPath);
  return fs.readFileSync(absPath, 'utf8');
}

console.log(`${BLUE}🧪 BioGRID Structured Content Regression Tests${RESET}`);

// Code Mode-only server — the four tools come from createSearchTool,
// createExecuteTool, createQueryDataHandler, createGetSchemaHandler in
// @bio-mcp/shared, which already emit content + structuredContent. These
// assertions verify the wiring is correct.
const toolExpectations = [
  {
    path: 'src/tools/code-mode.ts',
    required: ['createSearchTool', 'createExecuteTool', 'biogrid', 'biogridCatalog'],
  },
  {
    path: 'src/tools/query-data.ts',
    required: ['createQueryDataHandler', 'biogrid_query_data'],
  },
  {
    path: 'src/tools/get-schema.ts',
    required: ['createGetSchemaHandler', 'biogrid_get_schema'],
  },
];

for (const { path: filePath, required } of toolExpectations) {
  const content = readFile(filePath);
  for (const token of required) {
    assertContains(filePath, content, token, `${filePath} includes ${token}`);
  }
}

const indexContent = readFile('src/index.ts');
assertContains('src/index.ts', indexContent, 'BiogridDataDO', 'index.ts exports BiogridDataDO');
assertContains('src/index.ts', indexContent, 'StatelessMcpWorker', 'index.ts uses StatelessMcpWorker');
assertContains('src/index.ts', indexContent, 'registerCodeMode', 'index.ts wires registerCodeMode');
assertContains('src/index.ts', indexContent, 'registerQueryData', 'index.ts wires registerQueryData');
assertContains('src/index.ts', indexContent, 'registerGetSchema', 'index.ts wires registerGetSchema');

const catalogContent = readFile('src/spec/catalog.ts');
for (const category of ['interactions', 'metadata']) {
  assertContains(
    'src/spec/catalog.ts',
    catalogContent,
    `category: "${category}"`,
    `catalog covers category "${category}"`,
  );
}
assertContains('src/spec/catalog.ts', catalogContent, 'BIOGRID_ACCESS_KEY', 'catalog notes mention BIOGRID_ACCESS_KEY secret');
// `/chemicals/` is a hard nginx 404 upstream with or without a key and is absent
// from the official WADL. Advertising it told the model an endpoint existed that
// never answers, so the catalog must not name it as an operation again.
assertMissing('src/spec/catalog.ts', catalogContent, 'path: "/chemicals/"', 'catalog does not advertise the phantom /chemicals/ endpoint');
assertMissing('src/spec/catalog.ts', catalogContent, 'category: "chemicals"', 'catalog has no chemicals category');
// endpointCount used to be a hand-written 8 next to an array of 7.
assertContains('src/spec/catalog.ts', catalogContent, 'endpointCount: endpoints.length', 'catalog derives endpointCount from the endpoints array');

const adapterContent = readFile('src/lib/api-adapter.ts');
assertContains('src/lib/api-adapter.ts', adapterContent, 'normalizeInteractionsObject', 'api-adapter normalizes BioGRID keyed-by-id objects');
assertContains('src/lib/api-adapter.ts', adapterContent, 'BIOGRID_ACCESS_KEY', 'api-adapter wires BIOGRID_ACCESS_KEY env');

// The access key is preflighted BEFORE the upstream call, so the failure names
// BIOGRID_ACCESS_KEY instead of relaying an opaque upstream 401 body.
const adapterKeyGuard = adapterContent.indexOf('missingAccessKeyError()');
const adapterFirstFetch = adapterContent.indexOf('biogridFetch(');
assertTrue(
  adapterKeyGuard !== -1 && adapterFirstFetch !== -1 && adapterKeyGuard < adapterFirstFetch,
  'api-adapter throws missingAccessKeyError() BEFORE calling biogridFetch',
  `guard@${adapterKeyGuard} fetch@${adapterFirstFetch}`,
);

const httpContent = readFile('src/lib/http.ts');
assertContains('src/lib/http.ts', httpContent, 'accesskey', 'http.ts injects accesskey query param');
assertContains('src/lib/http.ts', httpContent, 'webservice.thebiogrid.org', 'http.ts targets webservice.thebiogrid.org');

const wranglerContent = readFile('wrangler.jsonc');
assertContains('wrangler.jsonc', wranglerContent, 'BIOGRID_DATA_DO', 'wrangler.jsonc binds BIOGRID_DATA_DO');
assertContains('wrangler.jsonc', wranglerContent, 'BiogridDataDO', 'wrangler.jsonc migrates BiogridDataDO class');
assertContains('wrangler.jsonc', wranglerContent, '"port": 8897', 'wrangler.jsonc dev port is 8897');
assertContains('wrangler.jsonc', wranglerContent, 'CODE_MODE_LOADER', 'wrangler.jsonc binds CODE_MODE_LOADER');

const readmeContent = readFile('README.md');
assertContains('README.md', readmeContent, 'https://webservice.thebiogrid.org/', 'README links the BioGRID registration page');
assertContains('README.md', readmeContent, 'wrangler secret put BIOGRID_ACCESS_KEY', 'README gives the wrangler secret command');

// --- Behaviour: the missing-key error is actionable, not decorative ----------
const accessKey = await import('../src/lib/access-key.ts');

assertTrue(accessKey.normalizeAccessKey(undefined) === undefined, 'normalizeAccessKey(undefined) is undefined');
assertTrue(accessKey.normalizeAccessKey('   ') === undefined, 'normalizeAccessKey(whitespace) is undefined — a blank secret is an unset secret');
assertTrue(accessKey.normalizeAccessKey('  abc  ') === 'abc', 'normalizeAccessKey trims the secret');

const missingErr = accessKey.missingAccessKeyError();
assertTrue(missingErr instanceof Error, 'missingAccessKeyError() returns an Error (it is thrown, never returned as data)');
assertTrue(missingErr.status === 401, 'missing-key error keeps status 401 so the caller still sees a failure', missingErr.status);
const remediation = missingErr.data?.error;
assertTrue(remediation?.code === 'BIOGRID_ACCESS_KEY_MISSING', 'missing-key error carries code BIOGRID_ACCESS_KEY_MISSING', remediation?.code);
assertTrue(remediation?.env_var === 'BIOGRID_ACCESS_KEY', 'missing-key error names the env var', remediation?.env_var);
assertTrue(remediation?.registration_url === 'https://webservice.thebiogrid.org/', 'missing-key error names the registration URL', remediation?.registration_url);
assertTrue(
  typeof remediation?.install_command === 'string' &&
    remediation.install_command.includes('wrangler secret put BIOGRID_ACCESS_KEY'),
  'missing-key error names the wrangler secret command',
  remediation?.install_command,
);
assertTrue(Array.isArray(remediation?.steps) && remediation.steps.length >= 3, 'missing-key error lists the registration steps', remediation?.steps?.length);
assertTrue(
  typeof remediation?.keyless_note === 'string' && remediation.keyless_note.includes('string-db'),
  'missing-key error states what is NOT substituted and where keyless PPI lives',
);

assertTrue(accessKey.rejectedAccessKeyRemediation(401)?.code === 'BIOGRID_ACCESS_KEY_REJECTED', 'an upstream 401 gets the rejected-key remediation');
assertTrue(accessKey.rejectedAccessKeyRemediation(403)?.code === 'BIOGRID_ACCESS_KEY_REJECTED', 'an upstream 403 gets the rejected-key remediation');
assertTrue(accessKey.rejectedAccessKeyRemediation(500) === undefined, 'a 500 is NOT reported as a key problem');

console.log(`\n${BLUE}📊 Test Results Summary${RESET}`);
console.log(`Total tests: ${totalTests}`);
console.log(`${GREEN}Passed: ${passedTests}${RESET}`);
console.log(`${RED}Failed: ${failedTests}${RESET}`);

if (failedTests > 0) {
  console.log(`\n${RED}❌ Regression tests failed.${RESET}`);
  process.exit(1);
}

console.log(`\n${GREEN}✅ BioGRID structured content regression tests passed.${RESET}`);
