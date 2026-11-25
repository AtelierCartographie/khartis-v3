import { EXPORT_MAP_STAGE_SELECTOR } from './constants';
import type { PageExportGeometry, RelativeRect } from './types';

export function getRelativeRect(
  element: Element,
  container: HTMLElement
): RelativeRect {
  const elementRect = element.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();

  return {
    x: elementRect.left - containerRect.left,
    y: elementRect.top - containerRect.top,
    width: elementRect.width,
    height: elementRect.height
  };
}
export function resolvePageExportGeometry(
  pageContainer: HTMLElement
): PageExportGeometry {
  const pageRect = pageContainer.getBoundingClientRect();
  const computed = getComputedStyle(pageContainer);
  const mapStage = pageContainer.querySelector(
    EXPORT_MAP_STAGE_SELECTOR
  ) as HTMLElement | null;
  const mapFrame = mapStage ? getRelativeRect(mapStage, pageContainer) : null;
  const paddingRight = parseCssPixels(computed.paddingRight);
  const paddingBottom = parseCssPixels(computed.paddingBottom);
  const width = Math.max(
    1,
    pageContainer.offsetWidth,
    pageRect.width,
    mapFrame ? mapFrame.x + mapFrame.width + paddingRight : 0
  );
  const height = Math.max(
    1,
    pageContainer.offsetHeight,
    pageRect.height,
    mapFrame ? mapFrame.y + mapFrame.height + paddingBottom : 0
  );

  return { width, height, mapFrame };
}
export function roundSvgValue(value: number): string {
  return Number.isFinite(value) ? Number(value.toFixed(3)).toString() : '0';
}
export function roundSvgCoord(value: number): string {
  return Number.isFinite(value) ? Number(value.toFixed(2)).toString() : '0';
}
export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
export function isNumberArrayLike(value: unknown): value is ArrayLike<number> {
  if (Array.isArray(value)) return true;
  if (ArrayBuffer.isView(value) && 'length' in value) return true;

  return (
    isRecord(value) &&
    typeof value.length === 'number' &&
    Number.isFinite(value.length)
  );
}
export function toNumberTuple(value: unknown, size?: number): number[] | null {
  if (!isNumberArrayLike(value)) return null;

  const tupleSize = Math.max(1, Math.floor(size ?? value.length));
  const output: number[] = [];

  for (let index = 0; index < tupleSize; index++) {
    const item = Number(value[index]);
    if (!Number.isFinite(item)) return null;
    output.push(item);
  }

  return output;
}
export function toFiniteNumber(value: unknown, fallback: number): number {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}
export function sanitizeSvgId(value: string): string {
  const normalized = value
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalized || 'layer';
}
export function sanitizeLocalizedSvgId(label: string): string {
  const stripped = label.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const sanitized = sanitizeSvgId(stripped);

  return /^\d/.test(sanitized) ? `id-${sanitized}` : sanitized;
}
export type SvgIdDeduper = (baseId: string) => string;
export function createSvgIdDeduper(): SvgIdDeduper {
  const usedCounts = new Map<string, number>();

  return (baseId: string): string => {
    const nextCount = (usedCounts.get(baseId) ?? 0) + 1;
    usedCounts.set(baseId, nextCount);

    return nextCount === 1 ? baseId : `${baseId}-${nextCount}`;
  };
}
export function parseCssPixels(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
