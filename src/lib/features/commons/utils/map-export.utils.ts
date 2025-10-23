import type { ProcessedDataset } from './data-pipeline.utils';
import type { VisualizationConfig } from '../store/visualization.store.svelte';
import { hexToRgb } from '../../map/utils/color.utils';
import {
  getColorForValue,
  getSizeForValue,
  getCategoricalColorMap
} from '../../map/utils/data-styling.utils';
import type { Table as ArrowTable } from 'apache-arrow';

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

function calculateDatasetBounds(
  dataset: ProcessedDataset
): GeometryBounds | null {
  const geometryColumn = dataset.columns.find((col) => col.type === 'geometry');
  if (!geometryColumn) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  dataset.data.forEach((row) => {
    const geometry = row[geometryColumn.name];
    if (!geometry || !geometry.coordinates) return;

    const processCoords = (coords: any) => {
      if (typeof coords[0] === 'number') {
        const [x, y] = coords;
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      } else {
        coords.forEach((c: any) => processCoords(c));
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
): (coords: [number, number]) => [number, number] {
  const dataWidth = bounds.maxX - bounds.minX;
  const dataHeight = bounds.maxY - bounds.minY;

  const availableWidth = width - 2 * padding;
  const availableHeight = height - 2 * padding;

  const scaleX = availableWidth / dataWidth;
  const scaleY = availableHeight / dataHeight;
  const scale = Math.min(scaleX, scaleY);

  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;

  return ([lon, lat]: [number, number]): [number, number] => {
    const x = (lon - centerX) * scale + width / 2;
    const y = (centerY - lat) * scale + height / 2;
    return [x, y];
  };
}

function renderPointToSvg(
  coordinates: [number, number],
  project: (coords: [number, number]) => [number, number],
  style: {
    fillColor: string;
    fillOpacity: number;
    strokeColor: string;
    strokeWidth: number;
    strokeOpacity: number;
  },
  radius: number = 5
): string {
  const [x, y] = project(coordinates);
  const [r, g, b] = hexToRgb(style.fillColor);
  const [sr, sg, sb] = hexToRgb(style.strokeColor);

  return `<circle cx="${x}" cy="${y}" r="${radius}" fill="rgb(${r},${g},${b})" fill-opacity="${style.fillOpacity}" stroke="rgb(${sr},${sg},${sb})" stroke-width="${style.strokeWidth}" stroke-opacity="${style.strokeOpacity}" />`;
}

function renderLineToSvg(
  coordinates: [number, number][],
  project: (coords: [number, number]) => [number, number],
  style: {
    strokeColor: string;
    strokeWidth: number;
    strokeOpacity: number;
  }
): string {
  if (coordinates.length === 0) return '';

  const points = coordinates.map((coord) => project(coord));
  const pathData = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0]},${p[1]}`)
    .join(' ');
  const [r, g, b] = hexToRgb(style.strokeColor);

  return `<path d="${pathData}" fill="none" stroke="rgb(${r},${g},${b})" stroke-width="${style.strokeWidth}" stroke-opacity="${style.strokeOpacity}" />`;
}

function renderPolygonToSvg(
  coordinates: [number, number][][],
  project: (coords: [number, number]) => [number, number],
  style: {
    fillColor: string;
    fillOpacity: number;
    strokeColor: string;
    strokeWidth: number;
    strokeOpacity: number;
  }
): string {
  if (coordinates.length === 0) return '';

  const paths = coordinates
    .map((ring) => {
      if (ring.length === 0) return '';
      const points = ring.map((coord) => project(coord));
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
  geometry: any,
  project: (coords: [number, number]) => [number, number],
  style: any,
  radius: number = 5
): string {
  if (!geometry || !geometry.type) return '';

  switch (geometry.type) {
    case 'Point':
      return renderPointToSvg(geometry.coordinates, project, style, radius);

    case 'MultiPoint':
      return geometry.coordinates
        .map((coord: [number, number]) =>
          renderPointToSvg(coord, project, style, radius)
        )
        .join('\n');

    case 'LineString':
      return renderLineToSvg(geometry.coordinates, project, style);

    case 'MultiLineString':
      return geometry.coordinates
        .map((line: [number, number][]) =>
          renderLineToSvg(line, project, style)
        )
        .join('\n');

    case 'Polygon':
      return renderPolygonToSvg(geometry.coordinates, project, style);

    case 'MultiPolygon':
      return geometry.coordinates
        .map((polygon: [number, number][][]) =>
          renderPolygonToSvg(polygon, project, style)
        )
        .join('\n');

    default:
      return '';
  }
}

function getFeatureStyle(
  visualization: VisualizationConfig,
  row: any,
  dataset: ProcessedDataset
): { style: any; radius?: number } {
  const baseStyle = {
    fillColor: visualization.style.fillColor || '#3b82f6',
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
      value !== null &&
      value !== undefined &&
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
    if (value !== null && value !== undefined && visualization.symbols) {
      const values = dataset.data
        .map((r) => r[visualization.mapping.sizeColumn!])
        .filter((v) => v !== null && v !== undefined);

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
      const geometry = row[geometryColumn.name];
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
      reject(error);
    }
  });
}
