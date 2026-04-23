import { PROJECT_CONST } from '../constants';
import {
  clampFontSize,
  DEFAULT_FONT_FAMILY,
  normalizeFontFamily
} from '$lib/features/step-toolbar/constants/fonts.constants';

export interface SchemaMigration {
  from: string;
  to: string;
  migrate: (data: Record<string, unknown>) => Record<string, unknown>;
}

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

function backfillSymbolDoubleFields(
  data: Record<string, unknown>
): Record<string, unknown> {
  const walk = (node: unknown): unknown => {
    if (Array.isArray(node)) {
      return node.map((item) => walk(item));
    }
    if (!isRecord(node)) {
      return node;
    }
    const clone: Record<string, unknown> = { ...node };
    const symbol = isRecord(clone.symbol) ? clone.symbol : null;
    if (symbol) {
      const nextSymbol: Record<string, unknown> = { ...symbol };
      if (nextSymbol.commonScale === undefined) {
        nextSymbol.commonScale = true;
      }
      if (nextSymbol.positionMode === undefined) {
        nextSymbol.positionMode = 'overlay';
      }
      if (nextSymbol.breakValueA === undefined) {
        nextSymbol.breakValueA = null;
      }
      if (nextSymbol.breakValueB === undefined) {
        nextSymbol.breakValueB = null;
      }
      clone.symbol = nextSymbol;
    }
    for (const key of Object.keys(clone)) {
      if (key === 'symbol') continue;
      clone[key] = walk(clone[key]);
    }
    return clone;
  };

  return walk(data) as Record<string, unknown>;
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
      fontFamily:
        normalizeFontFamily(
          typeof style.textFontFamily === 'string' ? style.textFontFamily : null
        ) ?? DEFAULT_FONT_FAMILY,
      color: style.textColor,
      opacity: style.textOpacity ?? 0,
      size: clampFontSize(style.textSize as number | undefined, 12),
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
        fontFamily:
          normalizeFontFamily(
            typeof style.labelFontFamily === 'string'
              ? style.labelFontFamily
              : null
          ) ?? DEFAULT_FONT_FAMILY,
        color: style.labelColor,
        opacity: style.labelOpacity ?? 0,
        size: clampFontSize(style.labelSize as number | undefined, 12),
        bold: style.labelBold ?? false,
        italic: style.labelItalic ?? false,
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

function normalizePersistenceSchema(
  data: Record<string, unknown>
): Record<string, unknown> {
  const clone = structuredClone(data);

  delete clone.visualization;
  delete clone.layout;
  delete clone.resources;

  const projectData = isRecord(clone.data) ? clone.data : null;
  const basemapSettings = projectData?.basemapSettings;
  const mapViewState = isRecord(basemapSettings)
    ? basemapSettings.mapViewState
    : null;

  if (
    isRecord(mapViewState) &&
    Array.isArray(mapViewState.center) &&
    mapViewState.center.length >= 2 &&
    typeof mapViewState.zoom === 'number' &&
    !Number.isFinite(mapViewState.baseZoom)
  ) {
    mapViewState.baseZoom = mapViewState.zoom;
  }

  const uiSettings = isRecord(projectData?.uiSettings)
    ? projectData.uiSettings
    : null;
  const dataTab = isRecord(uiSettings?.dataTab) ? uiSettings.dataTab : null;
  const basemapJoin = isRecord(dataTab?.basemapJoin)
    ? dataTab.basemapJoin
    : null;
  const projectBasemap = isRecord(projectData?.basemap)
    ? projectData.basemap
    : null;

  if (
    basemapJoin &&
    typeof projectBasemap?.id === 'string' &&
    projectBasemap.id.length > 0
  ) {
    delete basemapJoin.selectedBasemap;
    delete basemapJoin.basemapSource;
  }

  return clone;
}

const migrations: SchemaMigration[] = [
  // remapLegacyPointShape is idempotent — safe to apply at both 3.0.0 and 3.1.0.
  { from: '3.0.0', to: '3.1.0', migrate: remapLegacyPointShape },
  { from: '3.1.0', to: '3.2.0', migrate: remapLegacyPointShape },
  { from: '3.2.0', to: '3.3.0', migrate: backfillSymbolFillColor },
  { from: '3.3.0', to: '3.4.0', migrate: backfillPrimitiveConfigs },
  { from: '3.4.0', to: '3.5.0', migrate: backfillSymbolDoubleFields },
  { from: '3.5.0', to: '3.6.0', migrate: normalizePersistenceSchema }
];

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
