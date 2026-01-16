import type { ProcessedDataset } from '$lib/features/data-pipeline';
import * as m from '$lib/paraglide/messages';
import type { Geometry, Position } from 'geojson';
import {
  getCategoricalColorMap,
  getColorForValue,
  getSizeForValue
} from '../../map/utils/data-styling.utils';
import type { VisualizationConfig } from '../store/visualization.store.svelte';
import { hexToRgb } from './color-utils';
import { LogCategory, logger } from './logger';

interface ExportOptions {
  width: number;
  height: number;
  includeBasemap: boolean;
  backgroundColor: string;
}

const DEFAULT_EXPORT_OPTIONS: ExportOptions = {
  width: 1920,
  height: 1080,
  includeBasemap: false,
  backgroundColor: '#ffffff'
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
    throw new Error('Invalid coordinate position');
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

export function exportMapToSvg(
  datasets: ProcessedDataset[],
  visualizations: VisualizationConfig[],
  options: Partial<ExportOptions> = {}
): Blob {
  const opts = { ...DEFAULT_EXPORT_OPTIONS, ...options };

  const geometricDatasets = datasets.filter((d) => d.geometry);
  if (geometricDatasets.length === 0) {
    throw new Error('No geometric data to export');
  }

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

  if (!isFinite(bounds.minX)) {
    throw new Error('Unable to calculate map bounds');
  }

  const project = createProjection(bounds, opts.width, opts.height);

  let svgContent = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${opts.width}" height="${opts.height}" viewBox="0 0 ${opts.width} ${opts.height}">
  <rect width="100%" height="100%" fill="${opts.backgroundColor}" />
  <g id="map-layers">
`;

  const enabledVisualizations = visualizations.filter((v) => v.enabled);

  for (const visualization of enabledVisualizations) {
    const dataset = datasets.find((d) => d.id === visualization.datasetId);
    if (!dataset || !dataset.geometry) continue;

    const geometryColumn = dataset.columns.find(
      (col) => col.type === 'geometry'
    );
    if (!geometryColumn) continue;

    svgContent += `    <g id="${visualization.id}" class="visualization-layer">\n`;

    for (const row of dataset.data) {
      const geometry = row[geometryColumn.name] as Geometry | null | undefined;
      if (!geometry) continue;

      const { style, radius } = getFeatureStyle(visualization, row, dataset);
      const svgElement = renderGeometryToSvg(geometry, project, style, radius);

      if (svgElement) {
        svgContent += `      ${svgElement}\n`;
      }
    }

    svgContent += `    </g>\n`;
  }

  svgContent += `  </g>
  <text x="10" y="${opts.height - 10}" font-family="Arial, sans-serif" font-size="12" fill="#666666" opacity="0.7">${m.map_export_signature()}</text>
</svg>`;

  return new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
}

export function exportMapToJpg(
  datasets: ProcessedDataset[],
  visualizations: VisualizationConfig[],
  options: Partial<ExportOptions> = {}
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    try {
      const opts = { ...DEFAULT_EXPORT_OPTIONS, ...options };
      const svgBlob = exportMapToSvg(datasets, visualizations, options);

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
