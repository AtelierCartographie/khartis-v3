import type { ProcessedDataset } from '$lib/features/data-pipeline';
import * as m from '$lib/paraglide/messages';
import type { Geometry, Position } from 'geojson';
import {
  getCategoricalColorMap,
  getColorForValue,
  getSizeForValue
} from '../../map/utils/data-styling.utils';
import type { VisualizationConfig } from '../store/visualization.store.svelte';
import { hexToRgb, hslToHex } from './color-utils';
import { LogCategory, logger } from './logger';
import type {
  Annotation,
  AnnotationsState
} from '$lib/features/step-toolbar/tools/annotations/annotations.types';
import type {
  LegendItem,
  LegendState,
  LegendStyle
} from '$lib/features/step-toolbar/tools/legend/legend.types';
import {
  AnnotationKind,
  DrawingType,
  LegendPosition
} from '$lib/features/commons/constants/ui.constants';

interface ExportOptions {
  width: number;
  height: number;
  includeBasemap: boolean;
  backgroundColor: string;
}

const DEFAULT_EXPORT_WIDTH = 1920;
const DEFAULT_EXPORT_HEIGHT = 1080;
const DEFAULT_BACKGROUND_COLOR = '#ffffff';

const LEGEND_WIDTH = 200;
const LEGEND_HEIGHT = 150;
const LEGEND_MARGIN = 20;

const SVG_COLORS = {
  DEFAULT_FILL: '#3b82f6',
  DEFAULT_STROKE: '#1e40af',
  BLACK: '#000000',
  TEXT_PRIMARY: '#161616',
  TEXT_SECONDARY: '#525252',
  TEXT_MUTED: '#6f6f6f',
  TEXT_LEGEND: '#333333',
  SIGNATURE: '#666666'
} as const;

const DEFAULT_EXPORT_OPTIONS: ExportOptions = {
  width: DEFAULT_EXPORT_WIDTH,
  height: DEFAULT_EXPORT_HEIGHT,
  includeBasemap: false,
  backgroundColor: DEFAULT_BACKGROUND_COLOR
};

interface GeometryBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

interface FeatureStyle {
  fillColor: string;
  fillOpacity: number;
  strokeColor: string;
  strokeWidth: number;
  strokeOpacity: number;
}

type LonLat = [number, number];

function toLonLat(position: Position): LonLat {
  const lon = position[0];
  const lat = position[1];
  if (typeof lon !== 'number' || typeof lat !== 'number') {
    throw new Error(m.error_invalid_coordinate_position());
  }
  return [lon, lat];
}

function resolveFillColor(color?: string | string[]): string | undefined {
  if (Array.isArray(color)) {
    return color[0];
  }
  return color;
}

function calculateDatasetBounds(
  dataset: ProcessedDataset
): GeometryBounds | null {
  if (dataset.bounds) {
    return {
      minX: dataset.bounds.minLon,
      minY: dataset.bounds.minLat,
      maxX: dataset.bounds.maxLon,
      maxY: dataset.bounds.maxLat
    };
  }

  const geometryColumn = dataset.columns.find((col) => col.type === 'geometry');
  if (!geometryColumn) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  dataset.data.forEach((row) => {
    const geometry = row[geometryColumn.name] as
      | { coordinates?: unknown }
      | undefined;
    if (!geometry || !geometry.coordinates) return;

    const processCoords = (coords: unknown): void => {
      if (
        Array.isArray(coords) &&
        coords.length >= 2 &&
        typeof coords[0] === 'number' &&
        typeof coords[1] === 'number'
      ) {
        const [x, y] = coords as [number, number];
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      } else if (Array.isArray(coords)) {
        coords.forEach((c) => processCoords(c));
      }
    };

    processCoords(geometry.coordinates);
  });

  if (!isFinite(minX)) return null;

  return { minX, minY, maxX, maxY };
}

function createProjection(
  bounds: GeometryBounds,
  width: number,
  height: number,
  padding: number = 50
): (coords: LonLat) => LonLat {
  const dataWidth = bounds.maxX - bounds.minX;
  const dataHeight = bounds.maxY - bounds.minY;

  const availableWidth = width - 2 * padding;
  const availableHeight = height - 2 * padding;

  const scaleX = availableWidth / dataWidth;
  const scaleY = availableHeight / dataHeight;
  const scale = Math.min(scaleX, scaleY);

  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;

  return ([lon, lat]: LonLat): LonLat => {
    const x = (lon - centerX) * scale + width / 2;
    const y = (centerY - lat) * scale + height / 2;
    return [x, y];
  };
}

function renderPointToSvg(
  coordinates: Position,
  project: (coords: LonLat) => LonLat,
  style: FeatureStyle,
  radius: number = 5
): string {
  const [x, y] = project(toLonLat(coordinates));
  const [r, g, b] = hexToRgb(style.fillColor);
  const [sr, sg, sb] = hexToRgb(style.strokeColor);

  return `<circle cx="${x}" cy="${y}" r="${radius}" fill="rgb(${r},${g},${b})" fill-opacity="${style.fillOpacity}" stroke="rgb(${sr},${sg},${sb})" stroke-width="${style.strokeWidth}" stroke-opacity="${style.strokeOpacity}" />`;
}

function renderLineToSvg(
  coordinates: Position[],
  project: (coords: LonLat) => LonLat,
  style: FeatureStyle
): string {
  if (coordinates.length === 0) return '';

  const points = coordinates.map((coord) => project(toLonLat(coord)));
  const pathData = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0]},${p[1]}`)
    .join(' ');
  const [r, g, b] = hexToRgb(style.strokeColor);

  return `<path d="${pathData}" fill="none" stroke="rgb(${r},${g},${b})" stroke-width="${style.strokeWidth}" stroke-opacity="${style.strokeOpacity}" />`;
}

function renderPolygonToSvg(
  coordinates: Position[][],
  project: (coords: LonLat) => LonLat,
  style: FeatureStyle
): string {
  if (coordinates.length === 0) return '';

  const paths = coordinates
    .map((ring) => {
      if (ring.length === 0) return '';
      const points = ring.map((coord) => project(toLonLat(coord)));
      return (
        points
          .map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0]},${p[1]}`)
          .join(' ') + 'Z'
      );
    })
    .filter((p) => p !== '');

  const pathData = paths.join(' ');
  const [r, g, b] = hexToRgb(style.fillColor);
  const [sr, sg, sb] = hexToRgb(style.strokeColor);

  return `<path d="${pathData}" fill="rgb(${r},${g},${b})" fill-opacity="${style.fillOpacity}" stroke="rgb(${sr},${sg},${sb})" stroke-width="${style.strokeWidth}" stroke-opacity="${style.strokeOpacity}" />`;
}

function renderGeometryToSvg(
  geometry: Geometry | null | undefined,
  project: (coords: LonLat) => LonLat,
  style: FeatureStyle,
  radius: number = 5
): string {
  if (!geometry || !geometry.type) return '';

  switch (geometry.type) {
    case 'Point':
      return renderPointToSvg(geometry.coordinates, project, style, radius);

    case 'MultiPoint':
      return geometry.coordinates
        .map((coord) => renderPointToSvg(coord, project, style, radius))
        .join('\n');

    case 'LineString':
      return renderLineToSvg(geometry.coordinates, project, style);

    case 'MultiLineString':
      return geometry.coordinates
        .map((line) => renderLineToSvg(line, project, style))
        .join('\n');

    case 'Polygon':
      return renderPolygonToSvg(geometry.coordinates, project, style);

    case 'MultiPolygon':
      return geometry.coordinates
        .map((polygon) => renderPolygonToSvg(polygon, project, style))
        .join('\n');

    default:
      return '';
  }
}

function getFeatureStyle(
  visualization: VisualizationConfig,
  row: Record<string, unknown>,
  dataset: ProcessedDataset
): { style: FeatureStyle; radius?: number } {
  const initialFillColor = resolveFillColor(visualization.style.fillColor);
  const baseStyle: FeatureStyle = {
    fillColor: initialFillColor || '#3b82f6',
    fillOpacity: visualization.style.fillOpacity ?? 0.8,
    strokeColor: visualization.style.strokeColor || '#1e40af',
    strokeWidth: visualization.style.strokeWidth ?? 1,
    strokeOpacity: visualization.style.strokeOpacity ?? 1
  };

  let radius = 5;

  if (
    visualization.type === 'choropleth' &&
    visualization.mapping.valueColumn
  ) {
    const value = row[visualization.mapping.valueColumn];
    if (
      typeof value === 'number' &&
      visualization.classification?.breaks &&
      visualization.classification?.colors
    ) {
      const color = getColorForValue(
        value,
        visualization.classification.breaks,
        visualization.classification.colors
      );
      baseStyle.fillColor = `rgb(${color[0]},${color[1]},${color[2]})`;
    }
  }

  if (
    visualization.type === 'categorical' &&
    visualization.mapping.categoryColumn
  ) {
    const category = row[visualization.mapping.categoryColumn];
    if (
      category !== null &&
      category !== undefined &&
      visualization.classification?.colors
    ) {
      const categories = Array.from(
        new Set(
          dataset.data.map((r) => r[visualization.mapping.categoryColumn!])
        )
      ).filter((c) => c !== null && c !== undefined) as string[];

      const colorMap = getCategoricalColorMap(
        categories,
        visualization.classification.colors
      );
      const color = colorMap.get(String(category));
      if (color) {
        baseStyle.fillColor = `rgb(${color[0]},${color[1]},${color[2]})`;
      }
    }
  }

  if (
    visualization.type === 'proportional' &&
    visualization.mapping.sizeColumn
  ) {
    const value = row[visualization.mapping.sizeColumn];
    if (typeof value === 'number' && visualization.symbols) {
      const values = dataset.data
        .map((r) => r[visualization.mapping.sizeColumn!])
        .filter(
          (v) => v !== null && v !== undefined && typeof v === 'number'
        ) as number[];

      const min = Math.min(...values);
      const max = Math.max(...values);

      radius = getSizeForValue(
        value,
        min,
        max,
        visualization.symbols.minSize,
        visualization.symbols.maxSize,
        visualization.symbols.sizeScale
      );
    }
  }

  return { style: baseStyle, radius };
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function resolveColor(
  color:
    | string
    | { hue: number; saturation: number; lightness: number }
    | undefined,
  defaultColor: string
): string {
  if (!color) return defaultColor;
  if (typeof color === 'string') return color;
  return hslToHex(color.hue, color.saturation, color.lightness);
}

function toOpacityUnit(opacity: number | undefined): number {
  if (opacity === undefined) {
    return 1;
  }

  const rawValue = Number(opacity);
  if (!Number.isFinite(rawValue)) {
    return 1;
  }

  const percentValue = rawValue <= 1 ? rawValue * 100 : rawValue;
  const clampedPercent = Math.max(0, Math.min(100, percentValue));
  return clampedPercent / 100;
}

function renderTextAnnotation(item: Annotation): string {
  const content = String(item.content || '');
  if (!content.trim()) return '';

  const { x, y } = item.position;
  const style = item.style ?? {};
  const fontSize = style.fontSize ?? 14;
  const fontFamily = style.font ?? 'Arial';
  const color = resolveColor(style.color, SVG_COLORS.BLACK);
  const opacity = toOpacityUnit(style.opacity);
  const fontWeight = style.bold ? 'bold' : 'normal';
  const fontStyle = style.italic ? 'italic' : 'normal';
  const textDecoration = style.underlined ? 'underline' : 'none';

  return `    <text x="${x}" y="${y}" font-family="${fontFamily}, sans-serif" font-size="${fontSize}" fill="${color}" opacity="${opacity}" font-weight="${fontWeight}" font-style="${fontStyle}" text-decoration="${textDecoration}">${escapeHtml(content)}</text>`;
}

function renderShapeAnnotation(item: Annotation): string {
  const { x, y } = item.position;
  const shapeType = String(item.content ?? 'circle');
  const style = item.style ?? {};
  const fill = resolveColor(style.fillColor, SVG_COLORS.DEFAULT_FILL);
  const stroke = resolveColor(style.strokeColor, SVG_COLORS.DEFAULT_STROKE);
  const strokeWidth = style.strokeWidth ?? 2;
  const opacity = toOpacityUnit(style.opacity);
  const size = style.size ?? 50;

  switch (shapeType) {
    case 'circle':
      return `    <circle cx="${x}" cy="${y}" r="${size / 2}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" opacity="${opacity}"/>`;
    case 'rectangle':
      return `    <rect x="${x - size / 2}" y="${y - size / 2}" width="${size}" height="${size}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" opacity="${opacity}"/>`;
    case 'triangle': {
      const h = size * 0.866;
      const points = `${x},${y - h / 2} ${x - size / 2},${y + h / 2} ${x + size / 2},${y + h / 2}`;
      return `    <polygon points="${points}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" opacity="${opacity}"/>`;
    }
    case 'arrow': {
      const arrowPath = `M${x - size / 2},${y} L${x + size / 4},${y} L${x + size / 4},${y - size / 4} L${x + size / 2},${y} L${x + size / 4},${y + size / 4} L${x + size / 4},${y} Z`;
      return `    <path d="${arrowPath}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" opacity="${opacity}"/>`;
    }
    case 'star': {
      const outerR = size / 2;
      const innerR = outerR * 0.4;
      const points: string[] = [];
      for (let i = 0; i < 10; i++) {
        const r = i % 2 === 0 ? outerR : innerR;
        const angle = (Math.PI / 5) * i - Math.PI / 2;
        points.push(`${x + r * Math.cos(angle)},${y + r * Math.sin(angle)}`);
      }
      return `    <polygon points="${points.join(' ')}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" opacity="${opacity}"/>`;
    }
    default:
      return `    <circle cx="${x}" cy="${y}" r="${size / 2}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" opacity="${opacity}"/>`;
  }
}

function renderDrawingAnnotation(item: Annotation): string {
  const points = Array.isArray(item.content) ? item.content : [];
  if (points.length === 0) return '';

  const style = item.style ?? {};
  const stroke = resolveColor(style.strokeColor, SVG_COLORS.BLACK);
  const fill =
    style.drawingType === DrawingType.ZONE
      ? resolveColor(style.fillColor, 'none')
      : 'none';
  const strokeWidth = style.strokeWidth ?? 2;
  const opacity = toOpacityUnit(style.opacity);

  const pathData = points
    .map(
      (p: { x: number; y: number }, i: number) =>
        `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`
    )
    .join(' ');

  const closePath = style.drawingType === DrawingType.ZONE ? ' Z' : '';

  return `    <path d="${pathData}${closePath}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" opacity="${opacity}"/>`;
}

function renderImageAnnotation(item: Annotation): string {
  const imgSrc = String(item.content ?? '');
  if (!imgSrc) return '';

  const { x, y } = item.position;
  const size = item.style?.size ?? 100;
  const opacity = toOpacityUnit(item.style?.opacity);

  return `    <image x="${x}" y="${y}" width="${size}" height="${size}" href="${imgSrc}" opacity="${opacity}"/>`;
}

function renderAnnotationItem(item: Annotation): string {
  switch (item.type) {
    case AnnotationKind.TEXT:
      return renderTextAnnotation(item);
    case AnnotationKind.SHAPE:
      return renderShapeAnnotation(item);
    case AnnotationKind.DRAWING:
      return renderDrawingAnnotation(item);
    case AnnotationKind.IMAGE:
      return renderImageAnnotation(item);
    default:
      return '';
  }
}

function renderAnnotationsToSvg(annotations: AnnotationsState): string {
  const visibleItems = annotations.items.filter((i) => i.visible !== false);
  if (visibleItems.length === 0) return '';

  const elements = visibleItems
    .map((item) => renderAnnotationItem(item))
    .filter((e) => e !== '');

  if (elements.length === 0) return '';

  return `  <g id="annotations">\n${elements.join('\n')}\n  </g>\n`;
}

function calculateLegendPosition(
  position: LegendPosition,
  width: number,
  height: number
): { x: number; y: number } {
  switch (position) {
    case LegendPosition.TOP_LEFT:
      return { x: LEGEND_MARGIN, y: LEGEND_MARGIN };
    case LegendPosition.TOP_RIGHT:
      return { x: width - LEGEND_WIDTH - LEGEND_MARGIN, y: LEGEND_MARGIN };
    case LegendPosition.BOTTOM_LEFT:
      return { x: LEGEND_MARGIN, y: height - LEGEND_HEIGHT - LEGEND_MARGIN };
    case LegendPosition.BOTTOM_RIGHT:
      return {
        x: width - LEGEND_WIDTH - LEGEND_MARGIN,
        y: height - LEGEND_HEIGHT - LEGEND_MARGIN
      };
    default:
      return { x: width - LEGEND_WIDTH - LEGEND_MARGIN, y: LEGEND_MARGIN };
  }
}

function renderLegendBackground(
  style: LegendStyle,
  width: number,
  height: number
): string {
  if (!style.background.enabled) return '';

  const bgColor = hslToHex(
    style.background.color.hue,
    style.background.color.saturation,
    style.background.color.lightness
  );
  const opacity = style.background.opacity / 100;

  return `    <rect x="0" y="0" width="${width}" height="${height}" fill="${bgColor}" opacity="${opacity}" rx="4"/>`;
}

function renderClassificationLegend(
  viz: VisualizationConfig,
  startY: number,
  style: LegendStyle
): string {
  const colors = viz.classification?.colors ?? [];
  const breaks = viz.classification?.breaks ?? [];
  if (colors.length === 0) return '';

  const elements: string[] = [];

  colors.forEach((color, i) => {
    const y = startY + i * 22;
    elements.push(
      `    <rect x="12" y="${y}" width="20" height="18" fill="${color}" rx="2"/>`
    );

    const minVal = i === 0 ? '' : (breaks[i - 1]?.toLocaleString() ?? '');
    const maxVal = breaks[i]?.toLocaleString() ?? '';
    const label = minVal && maxVal ? `${minVal} - ${maxVal}` : maxVal || minVal;

    elements.push(
      `    <text x="40" y="${y + 14}" font-family="${style.fontFamily}, sans-serif" font-size="${style.fontSize}" fill="${SVG_COLORS.TEXT_LEGEND}">${escapeHtml(label)}</text>`
    );
  });

  return elements.join('\n');
}

function renderLegendContent(
  items: LegendItem[],
  visualizations: VisualizationConfig[],
  style: LegendStyle
): { content: string; height: number } {
  let yOffset = 16;
  const elements: string[] = [];

  for (const item of items) {
    const viz = item.variableId
      ? visualizations.find((v) => v.id === item.variableId)
      : undefined;

    if (item.title) {
      elements.push(
        `    <text x="12" y="${yOffset}" font-family="${style.fontFamily}, sans-serif" font-size="${style.fontSize + 2}" font-weight="600" fill="${SVG_COLORS.TEXT_PRIMARY}">${escapeHtml(item.title)}</text>`
      );
      yOffset += style.fontSize + 10;
    }

    if (item.subtitle) {
      elements.push(
        `    <text x="12" y="${yOffset}" font-family="${style.fontFamily}, sans-serif" font-size="${style.fontSize}" fill="${SVG_COLORS.TEXT_SECONDARY}">${escapeHtml(item.subtitle)}</text>`
      );
      yOffset += style.fontSize + 6;
    }

    if (viz?.classification?.colors && viz.classification.colors.length > 0) {
      const classLegend = renderClassificationLegend(viz, yOffset, style);
      if (classLegend) {
        elements.push(classLegend);
        yOffset += viz.classification.colors.length * 22 + 8;
      }
    }

    if (item.note) {
      elements.push(
        `    <text x="12" y="${yOffset}" font-family="${style.fontFamily}, sans-serif" font-size="${style.fontSize - 2}" fill="${SVG_COLORS.TEXT_MUTED}" font-style="italic">${escapeHtml(item.note)}</text>`
      );
      yOffset += style.fontSize + 4;
    }

    yOffset += 12;
  }

  return { content: elements.join('\n'), height: yOffset + 8 };
}

function renderLegendToSvg(
  legend: LegendState,
  visualizations: VisualizationConfig[],
  width: number,
  height: number
): string {
  if (!legend.visible || legend.items.length === 0) return '';

  const visibleItems = legend.items.filter((i) => i.visible);
  if (visibleItems.length === 0) return '';

  const { content, height: contentHeight } = renderLegendContent(
    visibleItems,
    visualizations,
    legend.style
  );

  const legendHeight = Math.max(contentHeight, 60);
  const { x, y } = calculateLegendPosition(legend.position, width, height);

  const background = renderLegendBackground(
    legend.style,
    LEGEND_WIDTH,
    legendHeight
  );

  return `  <g id="legend" transform="translate(${x}, ${y})">
${background}
${content}
  </g>\n`;
}

export function exportMapToSvg(
  datasets: ProcessedDataset[],
  visualizations: VisualizationConfig[],
  options: Partial<ExportOptions> = {},
  annotations?: AnnotationsState,
  legend?: LegendState
): Blob {
  const opts = { ...DEFAULT_EXPORT_OPTIONS, ...options };

  logger.info('[SVG DEBUG] exportMapToSvg called', LogCategory.EXPORT, {
    datasetCount: datasets.length,
    datasets: datasets.map((d) => ({
      id: d.id,
      name: d.name,
      geometry: d.geometry,
      dataLength: d.data?.length ?? 0
    })),
    visualizationCount: visualizations.length
  });

  const geometricDatasets = datasets.filter((d) => d.geometry);
  if (geometricDatasets.length === 0) {
    throw new Error(m.error_no_geometric_data_export());
  }

  logger.info('[SVG DEBUG] Geometric datasets', LogCategory.EXPORT, {
    count: geometricDatasets.length,
    ids: geometricDatasets.map((d) => d.id)
  });

  const bounds = geometricDatasets
    .map((d) => calculateDatasetBounds(d))
    .filter((b): b is GeometryBounds => b !== null)
    .reduce(
      (acc, b) => ({
        minX: Math.min(acc.minX, b.minX),
        minY: Math.min(acc.minY, b.minY),
        maxX: Math.max(acc.maxX, b.maxX),
        maxY: Math.max(acc.maxY, b.maxY)
      }),
      { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
    );

  logger.info('[SVG DEBUG] Calculated bounds', LogCategory.EXPORT, { bounds });

  if (!isFinite(bounds.minX)) {
    throw new Error(m.error_unable_calculate_map_bounds());
  }

  const project = createProjection(bounds, opts.width, opts.height);

  let svgContent = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${opts.width}" height="${opts.height}" viewBox="0 0 ${opts.width} ${opts.height}">
  <defs></defs>
  <rect id="background" width="100%" height="100%" fill="${opts.backgroundColor}"/>
  <g id="basemap"></g>
`;

  const enabledVisualizations = visualizations.filter((v) => v.enabled);

  logger.info('[SVG DEBUG] Processing visualizations', LogCategory.EXPORT, {
    enabledCount: enabledVisualizations.length,
    visualizations: enabledVisualizations.map((v) => ({
      id: v.id,
      datasetId: v.datasetId
    }))
  });

  for (const visualization of enabledVisualizations) {
    const dataset = datasets.find((d) => d.id === visualization.datasetId);

    logger.info('[SVG DEBUG] Processing visualization', LogCategory.EXPORT, {
      vizId: visualization.id,
      vizDatasetId: visualization.datasetId,
      datasetFound: !!dataset,
      datasetGeometry: dataset?.geometry,
      datasetDataLength: dataset?.data?.length ?? 0
    });

    if (!dataset || !dataset.geometry) {
      logger.warn(
        '[SVG DEBUG] Skipping viz - no dataset or geometry',
        LogCategory.EXPORT,
        {
          vizId: visualization.id
        }
      );
      continue;
    }

    const geometryColumn = dataset.columns.find(
      (col) => col.type === 'geometry'
    );

    logger.info('[SVG DEBUG] Geometry column search', LogCategory.EXPORT, {
      vizId: visualization.id,
      geometryColumnFound: !!geometryColumn,
      geometryColumnName: geometryColumn?.name,
      allColumnTypes: dataset.columns.map((c) => ({
        name: c.name,
        type: c.type
      }))
    });

    if (!geometryColumn) {
      logger.warn(
        '[SVG DEBUG] Skipping viz - no geometry column',
        LogCategory.EXPORT,
        {
          vizId: visualization.id
        }
      );
      continue;
    }

    const polygons: string[] = [];
    const symbols: string[] = [];

    logger.info('[SVG DEBUG] Iterating data rows', LogCategory.EXPORT, {
      vizId: visualization.id,
      rowCount: dataset.data.length,
      firstRowKeys: dataset.data[0] ? Object.keys(dataset.data[0]) : [],
      firstRowGeomType: dataset.data[0]
        ? typeof dataset.data[0][geometryColumn.name]
        : 'N/A',
      firstRowGeomValue: dataset.data[0]
        ? JSON.stringify(dataset.data[0][geometryColumn.name])?.substring(
            0,
            200
          )
        : 'N/A'
    });

    for (const row of dataset.data) {
      const geometry = row[geometryColumn.name] as Geometry | null | undefined;
      if (!geometry) continue;

      const { style, radius } = getFeatureStyle(visualization, row, dataset);
      const svgElement = renderGeometryToSvg(geometry, project, style, radius);

      if (svgElement) {
        const isPolygon = ['Polygon', 'MultiPolygon'].includes(geometry.type);
        const isLine = ['LineString', 'MultiLineString'].includes(
          geometry.type
        );
        if (isPolygon || isLine) {
          polygons.push(`        ${svgElement}`);
        } else {
          symbols.push(`        ${svgElement}`);
        }
      }
    }

    logger.info('[SVG DEBUG] Rendered elements', LogCategory.EXPORT, {
      vizId: visualization.id,
      polygonCount: polygons.length,
      symbolCount: symbols.length
    });

    svgContent += `  <g id="viz-${visualization.id}">
    <g id="polygons">
${polygons.join('\n')}
    </g>
    <g id="symbols">
${symbols.join('\n')}
    </g>
    <g id="labels"></g>
  </g>
`;
  }

  if (annotations) {
    svgContent += renderAnnotationsToSvg(annotations);
  }

  if (legend) {
    svgContent += renderLegendToSvg(
      legend,
      visualizations,
      opts.width,
      opts.height
    );
  }

  svgContent += `  <text id="signature" x="10" y="${opts.height - 10}" font-family="Arial, sans-serif" font-size="12" fill="${SVG_COLORS.SIGNATURE}" opacity="0.7">${m.map_export_signature()}</text>
</svg>`;

  return new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
}

export function exportMapToJpg(
  datasets: ProcessedDataset[],
  visualizations: VisualizationConfig[],
  options: Partial<ExportOptions> = {},
  annotations?: AnnotationsState,
  legend?: LegendState
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    try {
      const opts = { ...DEFAULT_EXPORT_OPTIONS, ...options };
      const svgBlob = exportMapToSvg(
        datasets,
        visualizations,
        options,
        annotations,
        legend
      );

      const reader = new FileReader();
      reader.onload = () => {
        const svgDataUrl = reader.result as string;
        const img = new Image();

        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = opts.width;
          canvas.height = opts.height;

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Unable to get canvas context'));
            return;
          }

          ctx.fillStyle = opts.backgroundColor;
          ctx.fillRect(0, 0, opts.width, opts.height);
          ctx.drawImage(img, 0, 0);

          ctx.font = '12px Arial, sans-serif';
          ctx.fillStyle = 'rgba(102, 102, 102, 0.7)';
          ctx.fillText(m.map_export_signature(), 10, opts.height - 10);

          canvas.toBlob(
            (blob) => {
              if (blob) {
                resolve(blob);
              } else {
                reject(new Error('Failed to create JPG blob'));
              }
            },
            'image/jpeg',
            0.95
          );
        };

        img.onerror = () => {
          reject(new Error('Failed to load SVG image'));
        };

        img.src = svgDataUrl;
      };

      reader.onerror = () => {
        reject(new Error('Failed to read SVG blob'));
      };

      reader.readAsDataURL(svgBlob);
    } catch (error) {
      logger.error(
        'Failed to convert SVG to data URL',
        LogCategory.EXPORT,
        error
      );
      reject(error);
    }
  });
}

export function exportMapToPng(
  datasets: ProcessedDataset[],
  visualizations: VisualizationConfig[],
  options: Partial<ExportOptions> = {},
  annotations?: AnnotationsState,
  legend?: LegendState
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    try {
      const opts = { ...DEFAULT_EXPORT_OPTIONS, ...options };
      const svgBlob = exportMapToSvg(
        datasets,
        visualizations,
        options,
        annotations,
        legend
      );

      const reader = new FileReader();
      reader.onload = () => {
        const svgDataUrl = reader.result as string;
        const img = new Image();

        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = opts.width;
          canvas.height = opts.height;

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Unable to get canvas context'));
            return;
          }

          ctx.fillStyle = opts.backgroundColor;
          ctx.fillRect(0, 0, opts.width, opts.height);
          ctx.drawImage(img, 0, 0);

          canvas.toBlob((blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error('Failed to create PNG blob'));
            }
          }, 'image/png');
        };

        img.onerror = () => {
          reject(new Error('Failed to load SVG image'));
        };

        img.src = svgDataUrl;
      };

      reader.onerror = () => {
        reject(new Error('Failed to read SVG blob'));
      };

      reader.readAsDataURL(svgBlob);
    } catch (error) {
      logger.error('Failed to export PNG', LogCategory.EXPORT, error);
      reject(error);
    }
  });
}
