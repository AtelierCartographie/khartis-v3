import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const swPath = resolve(process.cwd(), 'build/sw.js');
const indexPath = resolve(process.cwd(), 'build/index.html');
const hasBuild = existsSync(swPath) && existsSync(indexPath);

const WOFF2_PRECACHE_LIMIT = 60;
const JS_PRECACHE_LIMIT = 200;
const CSS_PRECACHE_LIMIT = 60;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getExpectedNavigationFallbackUrl(): string {
  const indexHtml = readFileSync(indexPath, 'utf8');
  const baseHref = indexHtml.match(/<base href="([^"]+)"/)?.[1];
  if (!baseHref) {
    throw new Error('Could not read the built base href.');
  }
  return baseHref;
}

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

  it('precaches the navigation fallback scope root', () => {
    const expectedUrl = getExpectedNavigationFallbackUrl();
    const matchesUrl = new RegExp(
      `["']?url["']?:["']${escapeRegExp(expectedUrl)}["']`
    ).test(swContent);
    expect(matchesUrl).toBe(true);
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

  it('handles FACTORY_RESET messages from clients', () => {
    expect(swContent).toContain('FACTORY_RESET');
  });
});
