import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const swPath = resolve(process.cwd(), 'build/sw.js');
const hasBuild = existsSync(swPath);

const WOFF2_PRECACHE_LIMIT = 60;
const JS_PRECACHE_LIMIT = 200;
const CSS_PRECACHE_LIMIT = 60;

describe.skipIf(!hasBuild)('PWA precache budget', () => {
  const swContent = hasBuild ? readFileSync(swPath, 'utf8') : '';

  function countMatches(pattern: RegExp): number {
    const matches = swContent.match(pattern);
    return matches ? matches.length : 0;
  }

  it('does not precache DuckDB extension wasm files', () => {
    const wasmCount = countMatches(/"[^"]+\.wasm[^"]*"/g);
    expect(wasmCount).toBe(0);
  });

  it('does not precache geometry parquet basemaps', () => {
    const parquetCount = countMatches(/"[^"]+\.parquet[^"]*"/g);
    expect(parquetCount).toBe(0);
  });

  it('keeps the woff2 precache budget under control', () => {
    const woff2Count = countMatches(/"[^"]+\.woff2[^"]*"/g);
    expect(woff2Count).toBeLessThanOrEqual(WOFF2_PRECACHE_LIMIT);
  });

  it('keeps the JS precache budget under control', () => {
    const jsCount = countMatches(/"[^"]+\.js[^"]*"/g);
    expect(jsCount).toBeLessThanOrEqual(JS_PRECACHE_LIMIT);
  });

  it('keeps the CSS precache budget under control', () => {
    const cssCount = countMatches(/"[^"]+\.css[^"]*"/g);
    expect(cssCount).toBeLessThanOrEqual(CSS_PRECACHE_LIMIT);
  });

  it('precaches the navigation fallback (index.html)', () => {
    const matchesUrl = /url:["'][^"']*index\.html["']/.test(swContent);
    const matchesString = /["'][^"']*\/index\.html["']/.test(swContent);
    expect(matchesUrl || matchesString).toBe(true);
  });

  it('registers the geopf-vector-tiles runtime cache', () => {
    expect(swContent).toContain('geopf-vector-tiles');
  });

  it('registers the openmaptiles runtime cache', () => {
    expect(swContent).toContain('openmaptiles');
  });

  it('registers the presets runtime cache', () => {
    expect(swContent).toMatch(/presets/);
  });

  it('handles CLEAR_OFFLINE_CACHE messages from clients', () => {
    expect(swContent).toContain('CLEAR_OFFLINE_CACHE');
  });
});
