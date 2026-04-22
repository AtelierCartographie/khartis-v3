import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(import.meta.dirname, 'layer-factory.ts'),
  'utf8'
);

describe('layer-factory — CategoryShapeMode routing to MultiShapeLayer', () => {
  it('imports MultiShapeLayer from the local module', () => {
    expect(source).toContain(
      "import { MultiShapeLayer } from './multi-shape-layer';"
    );
  });

  it('derives useCategoryShape from mode=CATEGORIES + non-UNIQUE categoryShape + categoryColumn (2 call sites)', () => {
    const matches = source.match(/const useCategoryShape =/g);
    expect(matches).not.toBeNull();
    expect((matches ?? []).length).toBeGreaterThanOrEqual(2);
    expect(source).toMatch(
      /useCategoryShape\s*=\s*[\s\S]{0,50}pointConfig\??\.mode\s*===\s*SymbolMode\.CATEGORIES[\s\S]{0,120}categoryShapeMode\s*!==\s*CategoryShapeMode\.UNIQUE/
    );
  });

  it('picks MultiShapeLayer over ScatterplotLayer when useCategoryShape is true (native scatter path)', () => {
    expect(source).toMatch(
      /const useMultiShapeLayer\s*=\s*useCategoryShape\s*\|\|\s*\(pointStrokeDashed && showPointStroke\)/
    );
    expect(source).toMatch(/if \(useMultiShapeLayer\) \{/);
    expect(source).toMatch(
      /return \[new ScatterplotLayer\(baseLayerProps\)\];/
    );
  });

  it('uses MultiShapeLayer for the centroid path (Polygon/Line symbols)', () => {
    expect(source).toMatch(
      /new MultiShapeLayer\(\{\s*id:\s*`\$\{pointLayerId\}-centroids`/
    );
  });

  it('routes DIFFERENT and ORDERED CategoryShapeMode branches distinctly', () => {
    expect(source).toMatch(
      /categoryShapeMode === CategoryShapeMode\.DIFFERENT/
    );
    expect(source).toMatch(/categoryShapeMode === CategoryShapeMode\.ORDERED/);
  });

  it('keeps centroid layer id deterministic with the point-layer-<uuid>-centroids suffix', () => {
    expect(source).toMatch(/pointLayerId\}-centroids/);
  });

  it('falls back to SHAPE_ORDINAL[CIRCLE] when an unknown shape is requested (both paths)', () => {
    const fallbackMatches = source.match(
      /SHAPE_ORDINAL\[[^\]]+\]\s*\?\?\s*SHAPE_ORDINAL\[ShapeType\.CIRCLE\]/g
    );
    expect(fallbackMatches).not.toBeNull();
    expect((fallbackMatches ?? []).length).toBeGreaterThanOrEqual(2);
  });
});

describe('layer-factory — E-10 basemap/projection change preserves layer id determinism', () => {
  it('derives the point layer id from createThematicLayerId using the ctx (projection-aware)', () => {
    expect(source).toMatch(
      /const pointLayerId = createThematicLayerId\(DeckLayerId\.POINT_LAYER, ctx\)/
    );
  });

  it('passes projectionSuffix through createThematicLayerId so basemap/projection switches rebuild the id deterministically', () => {
    const helperMatch = source.match(
      /export function createThematicLayerId\([\s\S]*?ctx\.projectionSuffix[\s\S]*?\n\}/
    );
    expect(helperMatch).not.toBeNull();
  });

  it('keeps the centroid layer id tied to pointLayerId so Polygon-sourced symbols survive basemap changes in lockstep', () => {
    expect(source).toMatch(/`\$\{pointLayerId\}-centroids`/);
  });

  it('avoids embedding basemap identifiers directly inside thematic layer ids', () => {
    expect(source).not.toMatch(/createThematicLayerId\([^)]*,\s*ctx\.basemap/);
  });
});
