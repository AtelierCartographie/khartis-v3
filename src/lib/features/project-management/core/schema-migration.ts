/**
 * Schema migration system for project persistence.
 *
 * When the serialized project format evolves (new fields, renamed fields, restructured stores),
 * old projects saved in IndexedDB or .kh files are automatically migrated to the latest schema.
 *
 * Migrations run in loadProject() before deserialize(), and in importProject() after parsing.
 */

import { PROJECT_CONST } from '../constants';

export interface SchemaMigration {
  from: string;
  to: string;
  migrate: (data: Record<string, unknown>) => Record<string, unknown>;
}

/**
 * Recursively remap legacy `type: 'point'` values on `symbols` blocks to the
 * new `'circle'` canonical value after the `ShapeType.POINT` → `ShapeType.CIRCLE`
 * rename in issue #92.
 */
function remapLegacyPointShape(
  data: Record<string, unknown>
): Record<string, unknown> {
  const walk = (node: unknown): unknown => {
    if (Array.isArray(node)) {
      return node.map((item) => walk(item));
    }
    if (node && typeof node === 'object') {
      const clone: Record<string, unknown> = {
        ...(node as Record<string, unknown>)
      };
      const symbols = clone.symbols;
      if (
        symbols &&
        typeof symbols === 'object' &&
        !Array.isArray(symbols) &&
        (symbols as Record<string, unknown>).type === 'point'
      ) {
        clone.symbols = {
          ...(symbols as Record<string, unknown>),
          type: 'circle'
        };
      }
      for (const key of Object.keys(clone)) {
        if (key === 'symbols') continue;
        clone[key] = walk(clone[key]);
      }
      return clone;
    }
    return node;
  };

  return walk(data) as Record<string, unknown>;
}

function backfillSymbolFillColor(
  data: Record<string, unknown>
): Record<string, unknown> {
  const walk = (node: unknown): unknown => {
    if (Array.isArray(node)) {
      return node.map((item) => walk(item));
    }
    if (node && typeof node === 'object') {
      const clone: Record<string, unknown> = {
        ...(node as Record<string, unknown>)
      };
      const style = clone.style;
      if (
        style &&
        typeof style === 'object' &&
        !Array.isArray(style) &&
        'fillColor' in style &&
        !('symbolFillColor' in style)
      ) {
        const typedStyle = style as Record<string, unknown>;
        clone.style = {
          ...typedStyle,
          symbolFillColor: typedStyle.fillColor
        };
      }
      for (const key of Object.keys(clone)) {
        if (key === 'style') continue;
        clone[key] = walk(clone[key]);
      }
      return clone;
    }
    return node;
  };

  return walk(data) as Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function backfillPrimitiveConfigs(
  data: Record<string, unknown>
): Record<string, unknown> {
  const walk = (node: unknown): unknown => {
    if (Array.isArray(node)) {
      return node.map((item) => walk(item));
    }

    if (!isRecord(node)) {
      return node;
    }

    const clone: Record<string, unknown> = {
      ...node
    };

    for (const key of Object.keys(clone)) {
      clone[key] = walk(clone[key]);
    }

    const style = isRecord(clone.style) ? clone.style : null;
    const mapping = isRecord(clone.mapping) ? clone.mapping : null;
    if (!style || !mapping) {
      return clone;
    }

    const modes = isRecord(clone.modes) ? clone.modes : null;
    const symbols = isRecord(clone.symbols) ? clone.symbols : null;
    const missingData = isRecord(clone.missingData) ? clone.missingData : null;
    const primitiveFilters = Array.isArray(clone.primitiveFilters)
      ? clone.primitiveFilters
      : ['point', 'line', 'polygon'];

    const isEnabled = (primitive: string): boolean =>
      primitiveFilters.includes(primitive);

    clone.polygon ??= {
      enabled: isEnabled('polygon'),
      fillMode: modes?.fill ?? 'unique',
      fillColor: style.fillColor,
      fillOpacity: style.fillOpacity ?? 1,
      strokeMode: modes?.stroke ?? 'unique',
      strokeColor: style.strokeColor,
      strokeWidth: style.strokeWidth ?? 1,
      strokeOpacity: style.strokeOpacity ?? 1,
      strokeDashed: style.strokeDashed ?? false,
      valueColumn: mapping.valueColumn,
      categoryColumn: mapping.categoryColumn,
      classification: clone.classification,
      missingData: missingData ?? undefined
    };

    clone.symbol ??= {
      enabled: isEnabled('point'),
      mode: modes?.symbol ?? 'unique',
      shape: symbols?.type ?? 'circle',
      size: symbols?.size ?? 10,
      minSize: symbols?.minSize ?? 1,
      maxSize: symbols?.maxSize ?? 10,
      sizeScale: symbols?.sizeScale ?? 'linear',
      opacity: symbols?.opacity ?? style.fillOpacity ?? 1,
      fillMode: modes?.fill ?? 'unique',
      fillColor: style.symbolFillColor ?? style.fillColor,
      fillColorB: style.fillColorB,
      strokeMode: modes?.stroke ?? 'unique',
      strokeColor: style.strokeColor,
      strokeWidth: style.strokeWidth ?? 1,
      strokeOpacity: style.strokeOpacity ?? 1,
      proportionalType: modes?.proportionalType ?? 'uniques',
      categoryShape: modes?.categoryShape ?? 'unique',
      valueColumn: mapping.valueColumn,
      categoryColumn: mapping.categoryColumn,
      sizeColumn: mapping.sizeColumn,
      classification:
        clone.symbolClassification ?? clone.classification ?? undefined,
      missingData: missingData ?? undefined
    };

    clone.line ??= {
      enabled: isEnabled('line'),
      colorMode: modes?.color ?? 'unique',
      thicknessMode: modes?.thickness ?? 'unique',
      color: style.lineColor,
      width: style.lineWidth ?? 1,
      maxWidth: style.lineMaxWidth ?? style.lineWidth ?? 1,
      opacity: style.lineOpacity ?? 1,
      dashed: style.lineDashed ?? false,
      valueColumn: mapping.valueColumn,
      categoryColumn: mapping.categoryColumn,
      sizeColumn: mapping.sizeColumn,
      classification:
        clone.lineClassification ?? clone.classification ?? undefined,
      missingData: missingData ?? undefined
    };

    clone.text ??= {
      enabled:
        isEnabled('text') ||
        Boolean(typeof style.textOpacity === 'number' && style.textOpacity > 0),
      labelColumn: mapping.labelColumn,
      colorMode: modes?.color ?? 'unique',
      sizeMode: modes?.size ?? 'fixed',
      color: style.textColor,
      opacity: style.textOpacity ?? 0,
      size: style.textSize ?? 12,
      bold: style.textBold ?? false,
      italic: style.textItalic ?? false,
      align: style.textAlign ?? 'left',
      halo: style.textHalo ?? false,
      haloColor: style.textHaloColor,
      haloWidth: style.textHaloWidth ?? 2,
      collisionDetection: style.textCollisionDetection ?? true,
      dxpMasking: style.textDxpMasking ?? false,
      valueColumn: mapping.valueColumn,
      categoryColumn: mapping.categoryColumn,
      classification:
        clone.textClassification ?? clone.classification ?? undefined,
      missingData: missingData ?? undefined,
      secondaryLabels: {
        enabled: Boolean(
          mapping.secondaryLabelColumn &&
          typeof style.labelOpacity === 'number' &&
          style.labelOpacity > 0
        ),
        labelColumn: mapping.secondaryLabelColumn,
        color: style.labelColor,
        opacity: style.labelOpacity ?? 0,
        size: style.labelSize ?? 12,
        align: style.labelAlign ?? 'left',
        halo: style.labelHalo ?? false,
        haloColor: style.labelHaloColor,
        haloWidth: style.labelHaloWidth ?? 2,
        collisionDetection: style.labelCollisionDetection ?? true,
        dxpMasking: style.labelDxpMasking ?? false
      }
    };

    return clone;
  };

  return walk(data) as Record<string, unknown>;
}

/** Ordered list of migrations. Each runs sequentially when needed. */
const migrations: SchemaMigration[] = [
  // Chain both 3.0.0 and 3.1.0 through the point→circle remap; the function is
  // idempotent so re-running it on an already-migrated project is a no-op.
  { from: '3.0.0', to: '3.1.0', migrate: remapLegacyPointShape },
  { from: '3.1.0', to: '3.2.0', migrate: remapLegacyPointShape },
  { from: '3.2.0', to: '3.3.0', migrate: backfillSymbolFillColor },
  { from: '3.3.0', to: '3.4.0', migrate: backfillPrimitiveConfigs }
];

/**
 * Run all applicable migrations on a serialized project.
 * Returns the migrated data with the current schema version stamped.
 * The version is stamped on the returned (possibly cloned) manifest, not the
 * input, because migrations deep-clone their payload.
 */
export function migrateIfNeeded(
  data: Record<string, unknown>
): Record<string, unknown> {
  const inputManifest = data.manifest as
    | { version?: string; [k: string]: unknown }
    | undefined;
  let currentVersion = inputManifest?.version ?? '3.0.0';
  let migrated = data;

  for (const migration of migrations) {
    if (currentVersion === migration.from) {
      try {
        migrated = migration.migrate(migrated);
        currentVersion = migration.to;
      } catch (error) {
        throw new Error(
          `Schema migration ${migration.from} → ${migration.to} failed`,
          {
            cause: error
          }
        );
      }
    }
  }

  const outputManifest = migrated.manifest as
    | { version?: string; [k: string]: unknown }
    | undefined;
  if (outputManifest) {
    outputManifest.version = PROJECT_CONST.APP_VERSION;
  }

  return migrated;
}
