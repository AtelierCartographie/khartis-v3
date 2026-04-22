import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(import.meta.dirname, 'map-export.utils.ts'),
  'utf8'
);

describe('map export DOM mutations', () => {
  it('keeps the export cleanup focused on debug-only UI without injecting an extra credit watermark', () => {
    expect(source).toContain("domNode.classList?.contains('page-grid')");
    expect(source).not.toContain('pageContainer.appendChild(sig)');
    expect(source).not.toContain('m.map_export_signature()');
  });
});
