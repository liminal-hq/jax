// Guards the published ESM: every relative import must name its .js file, or plain Node cannot load the package
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'test-utils' ? [] : sources(path);
    return path.endsWith('.ts') && !path.endsWith('.test.ts') ? [path] : [];
  });
}

const RELATIVE = /(?:from|import)\s*\(?\s*["\x27](\.[^"\x27]*)["\x27]/g;

describe('relative imports', () => {
  it('all end in .js, so the built package loads under plain Node ESM', () => {
    const bad: string[] = [];
    for (const file of sources('src')) {
      for (const match of readFileSync(file, 'utf8').matchAll(RELATIVE)) {
        if (!match[1]!.endsWith('.js')) bad.push(`${file}: ${match[1]}`);
      }
    }
    expect(bad).toEqual([]);
  });
});
