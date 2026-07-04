import { SimplificationLevel } from '../../commons/types/enums';
import type { BasemapMetadata } from '../types/basemap.types';

const SIMPLIFICATION_LEVEL_ORDER = [
  SimplificationLevel.Low,
  SimplificationLevel.Medium,
  SimplificationLevel.High
] as const;

export const CATALOG_SIMPLIFICATION_PRIORITY = [
  SimplificationLevel.Medium,
  SimplificationLevel.High,
  SimplificationLevel.Low
] as const;

const VARIANT_SUFFIX_REGEX = /-(low|medium|high|simplified|detailed)$/;

function isSimplificationLevel(
  value: string | null | undefined
): value is SimplificationLevel {
  return (
    value === SimplificationLevel.Low ||
    value === SimplificationLevel.Medium ||
    value === SimplificationLevel.High
  );
}

export function getBasemapSimplificationLevel(
  metadata: BasemapMetadata
): SimplificationLevel | null {
  return isSimplificationLevel(metadata.simplification_level)
    ? metadata.simplification_level
    : null;
}

export function getBasemapVariantFamily(file: string): string {
  return file.replace(VARIANT_SUFFIX_REGEX, '');
}

export function getAvailableBasemapSimplificationLevels(
  basemaps: BasemapMetadata[],
  basemapFile: string
): SimplificationLevel[] {
  const family = getBasemapVariantFamily(basemapFile);
  const levels = new Set<SimplificationLevel>();

  for (const basemap of basemaps) {
    if (getBasemapVariantFamily(basemap.file) !== family) {
      continue;
    }

    const level = getBasemapSimplificationLevel(basemap);
    if (!level) {
      continue;
    }

    levels.add(level);
  }

  return SIMPLIFICATION_LEVEL_ORDER.filter((level) => levels.has(level));
}

export function getPreferredCatalogBasemapLevel(
  basemaps: BasemapMetadata[],
  basemapFile: string
): SimplificationLevel | null {
  const availableLevels = getAvailableBasemapSimplificationLevels(
    basemaps,
    basemapFile
  );

  for (const level of CATALOG_SIMPLIFICATION_PRIORITY) {
    if (availableLevels.includes(level)) {
      return level;
    }
  }

  return null;
}

export function getPreferredBasemapFile(
  basemaps: BasemapMetadata[],
  basemapFile: string
): string {
  if (basemaps.some((candidate) => candidate.file === basemapFile)) {
    return basemapFile;
  }

  const preferredLevel = getPreferredCatalogBasemapLevel(basemaps, basemapFile);
  if (!preferredLevel) {
    return basemapFile;
  }

  return `${getBasemapVariantFamily(basemapFile)}-${preferredLevel}`;
}

export function getPreferredBasemapSimplificationLevel(
  basemaps: BasemapMetadata[],
  metadata: BasemapMetadata,
  requestedLevel?: SimplificationLevel | null
): SimplificationLevel | null {
  const availableLevels = getAvailableBasemapSimplificationLevels(
    basemaps,
    metadata.file
  );

  if (availableLevels.length === 0) {
    return null;
  }

  const currentLevel = getBasemapSimplificationLevel(metadata);
  const candidateLevels = [
    requestedLevel,
    currentLevel,
    SimplificationLevel.Medium,
    SimplificationLevel.High,
    SimplificationLevel.Low
  ];

  for (const level of candidateLevels) {
    if (level && availableLevels.includes(level)) {
      return level;
    }
  }

  return availableLevels[0] ?? null;
}

export function resolveBasemapVariantFile(
  file: string,
  currentLevel: string | undefined,
  nextLevel: SimplificationLevel
): string | null {
  if (!isSimplificationLevel(currentLevel)) {
    return null;
  }

  return file.replace(new RegExp(`-${currentLevel}$`), `-${nextLevel}`);
}
