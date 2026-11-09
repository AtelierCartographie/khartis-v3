import type {
  MeasuredMapPage,
  PageBox
} from '$lib/features/commons/utils/map-export.utils';
import { MM_PER_PAGE_UNIT, PT_PER_PAGE_UNIT, type Rgba } from './qml';
import type {
  LayoutBox,
  LayoutFont,
  LayoutLegend,
  LayoutLegendSection,
  LayoutMap,
  LayoutText,
  QgisLayout
} from './qgis-layout';

const LEGEND_ITEM_PREFIX = 'legend-viz-';
// A frame drawn round the data leaves room for the symbols on its edges.
const DATA_FRAME_MARGIN = 0.08;
// Legend items name the polygon primitive `area`.
const LEGEND_PRIMITIVES: Record<string, string> = { area: 'polygon' };

/**
 * A legend frame of the page, read from its item id:
 * `legend-viz-<id>[--facet--<column>]--<primitive>[--<channel>]`.
 */
export function parseLegendItemId(
  itemId: string
): { vizId: string; primitive: string; channel?: string } | null {
  if (!itemId.startsWith(LEGEND_ITEM_PREFIX)) {
    return null;
  }
  const [vizId, ...parts] = itemId.slice(LEGEND_ITEM_PREFIX.length).split('--');
  const at = parts.findIndex((part) =>
    ['point', 'area', 'line', 'text'].includes(part)
  );
  if (!vizId || at === -1) {
    return null;
  }
  const primitive = LEGEND_PRIMITIVES[parts[at]] ?? parts[at];
  const channel = parts[at + 1];
  return channel ? { vizId, primitive, channel } : { vizId, primitive };
}

/**
 * The size legend Khartis draws for a visualization, in its order: labels
 * and sizes in millimetres (symbol height, line width), and its frame.
 */
export function measuredSizeLegend(
  page: MeasuredMapPage | null,
  vizId: string,
  primitive: string
): {
  itemId: string;
  subtitle: string | null;
  classes: Array<{ label: string; sizeMm: number }>;
} | null {
  const legend = page?.legends.find((entry) => {
    const parsed = parseLegendItemId(entry.itemId);
    return (
      parsed?.vizId === vizId &&
      parsed.primitive === primitive &&
      entry.sizes.length > 0
    );
  });
  return legend
    ? {
        itemId: legend.itemId,
        subtitle: legend.subtitle,
        classes: legend.sizes.map(({ label, size }) => ({
          label,
          sizeMm: size * MM_PER_PAGE_UNIT
        }))
      }
    : null;
}

/** `rgb()` or `rgba()` as the browser computes it. */
export function parseCssColor(value: string | null): Rgba | null {
  const channels = value?.match(/rgba?\(([^)]+)\)/)?.[1];
  if (!channels) {
    return null;
  }
  const [r, g, b, a = '1'] = channels.split(/[\s,/]+/).filter(Boolean);
  const alpha = Number(a.endsWith('%') ? Number.parseFloat(a) / 100 : a);
  const rgba = [Number(r), Number(g), Number(b), Math.round(alpha * 255)];
  return rgba.every(Number.isFinite) ? (rgba as unknown as Rgba) : null;
}

export function toLayoutBox(box: PageBox): LayoutBox {
  return {
    x: box.x * MM_PER_PAGE_UNIT,
    y: box.y * MM_PER_PAGE_UNIT,
    width: box.width * MM_PER_PAGE_UNIT,
    height: box.height * MM_PER_PAGE_UNIT
  };
}

/**
 * The extent around `extent` with the proportions of `box`, centred: QGIS
 * draws a frame at one scale on both axes.
 */
export function fitExtent(
  extent: [number, number, number, number],
  box: LayoutBox,
  margin = 0
): [number, number, number, number] {
  const [xmin, ymin, xmax, ymax] = extent;
  const width = Math.max(xmax - xmin, 1e-9) * (1 + 2 * margin);
  const height = Math.max(ymax - ymin, 1e-9) * (1 + 2 * margin);
  const ratio = box.width / Math.max(box.height, 1e-9);
  const cx = (xmin + xmax) / 2;
  const cy = (ymin + ymax) / 2;
  const [w, h] =
    width / height > ratio ? [width, width / ratio] : [height * ratio, height];
  return [cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2];
}

export interface PageLayoutInput {
  page: MeasuredMapPage;
  name: string;
  pageColor: Rgba;
  mapBackground: Rgba | null;
  /** The map frame in the CRS, when the map follows one exactly. */
  georeferencedExtent: [number, number, number, number] | null;
  /** Extent of the thematic layers of each map (by theme), or of the map. */
  dataExtent: (theme?: string) => [number, number, number, number] | null;
  /** Themes the project defines, one per map of a collection. */
  themes: string[];
  legends: Array<{
    itemId: string;
    title: string;
    note?: string;
    font: LayoutFont;
    titleFont: LayoutFont;
    tables: LegendTable[];
  }>;
  scaleBar: {
    form: 'line' | 'box';
    unit: 'km' | 'mi';
    distance: number;
    font: LayoutFont;
  } | null;
  northArrow: boolean;
  textName: (role: string | null, index: number) => string;
}

/** A GeoPackage table a legend lists, and the entries it shows. */
export interface LegendTable {
  table: string;
  nodeOrder?: number[];
  /** Shown above the layer's entries. */
  subtitle?: string;
  iconSizes?: Record<number, [number, number]>;
}

export type PageLayoutSpec = Omit<QgisLayout, 'legends'> & {
  legends: Array<
    Omit<LayoutLegend, 'sections'> & {
      sections: Array<
        Omit<LayoutLegendSection, 'layers'> & { tables: LegendTable[] }
      >;
    }
  >;
};

type SpecLegend = PageLayoutSpec['legends'][number];

// The next legend of a column starts below the previous one, both sharing
// most of their width.
function followsInColumn(previous: LayoutBox, next: LayoutBox): boolean {
  const overlap =
    Math.min(previous.x + previous.width, next.x + next.width) -
    Math.max(previous.x, next.x);
  return (
    overlap > 0.5 * Math.min(previous.width, next.width) &&
    next.y >= previous.y + previous.height - 1
  );
}

/**
 * Khartis legends stacked in one column become one QGIS legend: its entries
 * take more room than the Khartis frames, and separate legends would
 * overlap.
 */
export function stackLegends(
  legends: Array<{ box: LayoutBox; legend: SpecLegend }>
): SpecLegend[] {
  const columns: Array<{ last: LayoutBox; legend: SpecLegend }> = [];
  for (const entry of [...legends].sort((a, b) => a.box.y - b.box.y)) {
    const column = columns.find(({ last }) => followsInColumn(last, entry.box));
    if (column) {
      column.legend = {
        ...column.legend,
        sections: [...column.legend.sections, ...entry.legend.sections]
      };
      column.last = entry.box;
    } else {
      columns.push({ last: entry.box, legend: entry.legend });
    }
  }
  return columns.map(({ legend }) => legend);
}

/** The QGIS print layout of a measured Khartis page. */
export function buildPageLayoutSpec(input: PageLayoutInput): PageLayoutSpec {
  const { page } = input;
  const mapKey = 'Carte';
  const maps: LayoutMap[] = [];
  if (page.facets.length > 0) {
    page.facets.forEach((facet, index) => {
      const box = toLayoutBox(facet.box);
      const theme = input.themes.includes(facet.title)
        ? facet.title
        : input.themes[index];
      const extent = input.dataExtent(theme);
      if (extent) {
        maps.push({
          key: index === 0 ? mapKey : `${mapKey} ${index + 1}`,
          box,
          extent: fitExtent(extent, box, DATA_FRAME_MARGIN),
          background: input.mapBackground,
          theme
        });
      }
    });
  } else {
    const frame = page.placement
      ? {
          x: page.placement.offsetX,
          y: page.placement.offsetY,
          width: page.placement.viewportWidth * page.placement.scale,
          height: page.placement.viewportHeight * page.placement.scale
        }
      : page.map;
    const extent = input.georeferencedExtent ?? input.dataExtent();
    if (frame && extent) {
      const box = toLayoutBox(frame);
      maps.push({
        key: mapKey,
        box,
        extent: input.georeferencedExtent
          ? extent
          : fitExtent(extent, box, DATA_FRAME_MARGIN),
        background: input.mapBackground
      });
    }
  }

  // A text left off the page is clipped there.
  const onPage = [
    ...page.facets.flatMap((facet) =>
      facet.titleText ? [facet.titleText] : []
    ),
    ...page.texts
  ].filter(
    ({ box }) =>
      box.x < page.width &&
      box.y < page.height &&
      box.x + box.width > 0 &&
      box.y + box.height > 0
  );
  const texts: LayoutText[] = onPage.map((text, index) => ({
    name: input.textName(text.role, index),
    box: toLayoutBox(text.box),
    text: text.text,
    font: {
      family: text.fontFamily,
      sizePt: text.fontSize * PT_PER_PAGE_UNIT,
      bold: text.bold,
      italic: text.italic,
      color: parseCssColor(text.color) ?? [0, 0, 0, 255]
    },
    align: text.align,
    background: parseCssColor(text.background)
  }));

  const legends = stackLegends(
    input.legends.flatMap((legend) => {
      const frame = page.legends.find(
        (entry) => entry.itemId === legend.itemId
      );
      if (!frame || maps.length === 0 || legend.tables.length === 0) {
        return [];
      }
      const box = toLayoutBox(frame.box);
      return [
        {
          box,
          legend: {
            name: legend.title,
            box,
            mapKey: maps[0].key,
            font: legend.font,
            titleFont: legend.titleFont,
            sections: [
              { title: legend.title, note: legend.note, tables: legend.tables }
            ]
          }
        }
      ];
    })
  );

  const map = maps[0];
  return {
    name: input.name,
    page: {
      width: page.width * MM_PER_PAGE_UNIT,
      height: page.height * MM_PER_PAGE_UNIT,
      color: input.pageColor
    },
    maps,
    texts,
    legends,
    scaleBar:
      map && page.scaleBar && input.scaleBar && input.scaleBar.distance > 0
        ? {
            box: toLayoutBox(page.scaleBar),
            mapKey: map.key,
            form: input.scaleBar.form,
            unit: input.scaleBar.unit,
            // Khartis labels the whole length only.
            segments: 1,
            unitsPerSegment: input.scaleBar.distance,
            font: input.scaleBar.font
          }
        : undefined,
    northArrow:
      map && page.northArrow && input.northArrow
        ? { box: toLayoutBox(page.northArrow), mapKey: map.key }
        : undefined
  };
}
