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
assertContains('src/index.ts', indexContent, 'McpAgent', 'index.ts uses McpAgent');
assertContains('src/index.ts', indexContent, 'registerCodeMode', 'index.ts wires registerCodeMode');
assertContains('src/index.ts', indexContent, 'registerQueryData', 'index.ts wires registerQueryData');
assertContains('src/index.ts', indexContent, 'registerGetSchema', 'index.ts wires registerGetSchema');

const catalogContent = readFile('src/spec/catalog.ts');
for (const category of ['interactions', 'metadata', 'chemicals']) {
  assertContains(
    'src/spec/catalog.ts',
    catalogContent,
    `category: "${category}"`,
    `catalog covers category "${category}"`,
  );
}
assertContains('src/spec/catalog.ts', catalogContent, 'BIOGRID_ACCESS_KEY', 'catalog notes mention BIOGRID_ACCESS_KEY secret');

const adapterContent = readFile('src/lib/api-adapter.ts');
assertContains('src/lib/api-adapter.ts', adapterContent, 'normalizeInteractionsObject', 'api-adapter normalizes BioGRID keyed-by-id objects');
assertContains('src/lib/api-adapter.ts', adapterContent, 'BIOGRID_ACCESS_KEY', 'api-adapter wires BIOGRID_ACCESS_KEY env');

const httpContent = readFile('src/lib/http.ts');
assertContains('src/lib/http.ts', httpContent, 'accesskey', 'http.ts injects accesskey query param');
assertContains('src/lib/http.ts', httpContent, 'webservice.thebiogrid.org', 'http.ts targets webservice.thebiogrid.org');

const wranglerContent = readFile('wrangler.jsonc');
assertContains('wrangler.jsonc', wranglerContent, 'BIOGRID_DATA_DO', 'wrangler.jsonc binds BIOGRID_DATA_DO');
assertContains('wrangler.jsonc', wranglerContent, 'BiogridDataDO', 'wrangler.jsonc migrates BiogridDataDO class');
assertContains('wrangler.jsonc', wranglerContent, '"port": 8897', 'wrangler.jsonc dev port is 8897');
assertContains('wrangler.jsonc', wranglerContent, 'CODE_MODE_LOADER', 'wrangler.jsonc binds CODE_MODE_LOADER');

console.log(`\n${BLUE}📊 Test Results Summary${RESET}`);
console.log(`Total tests: ${totalTests}`);
console.log(`${GREEN}Passed: ${passedTests}${RESET}`);
console.log(`${RED}Failed: ${failedTests}${RESET}`);

if (failedTests > 0) {
  console.log(`\n${RED}❌ Regression tests failed.${RESET}`);
  process.exit(1);
}

console.log(`\n${GREEN}✅ BioGRID structured content regression tests passed.${RESET}`);
