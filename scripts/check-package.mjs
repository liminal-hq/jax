// Fails unless `npm pack` would publish exactly what a consumer needs: the licences, the readme,
// the built entry points and their types, and nothing from the source, demo or assets.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { execFileSync } from 'node:child_process';

const REQUIRED = [
  'LICENSE-APACHE',
  'LICENSE-MIT',
  'README.md',
  'package.json',
  'dist/index.js',
  'dist/index.d.ts',
  'dist/fallback/index.js',
  'dist/fallback/index.d.ts'
];
const FORBIDDEN = /^(src|demo|scripts|assets|docs|node_modules)\//;

const output = execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
  encoding: 'utf8'
});
const files = JSON.parse(output)[0].files.map((file) => file.path);

const missing = REQUIRED.filter((path) => !files.includes(path));
const unwanted = files.filter((path) => FORBIDDEN.test(path));

if (missing.length > 0) console.error(`The package is missing: ${missing.join(', ')}`);
if (unwanted.length > 0) console.error(`The package includes: ${unwanted.join(', ')}`);
if (missing.length > 0 || unwanted.length > 0) process.exit(1);

console.log(`The package has ${files.length} files, including every required one.`);
