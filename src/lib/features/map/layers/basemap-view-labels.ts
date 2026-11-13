import type { Layer } from '@deck.gl/core';
import { TextLayer } from '@deck.gl/layers';
import type { Matrix4 } from '@math.gl/core';
import type { ProjectionLike } from '@ateliercartographie/geoarrow-deck-stream';

import { hexToRgb } from '$lib/features/commons/utils/color-utils';
import { measureTextWidth } from '$lib/features/commons/utils/text-measure.utils';
import { resolveFontFamilyStack } from '$lib/features/step-toolbar';
import { fontAssetsStore } from '$lib/features/commons/stores/font-assets.store.svelte';

import type { VuesLayerConfig } from '../stores/basemap-layers.store.svelte';
import { labelLayoutStore } from '../stores/label-layout.store.svelte';
import type { DeckDataRow } from '../types';
import type { ViewLabelPlacement } from '../types/basemap.types';
import type { LabelOffset } from '../utils/label-layout.utils';
import type { ViewLabel } from '../utils/projection-preset-names.utils';
import type { LabelEditingContext } from './text-layer-factory';
import type { TextLayerDatum } from './text-layer-data.utils';
import { hasCompositeGraticuleSubProjections } from './basemap-graticule';
import {
  DEFAULT_TEXT_LINE_HEIGHT,
  extendTextCharacterSet,
  resolveTextFontSettings
} from './text-character-set';

// The view names share the thematic labels' layout store under this key, so a
// moved or retyped name is saved with the project like any label.
export const VIEW_LABELS_LAYOUT_KEY = 'basemap:vues';

const VIEW_LABEL_INSET_PX = 4;
const VIEW_LABEL_GAP_PX = 2;
const VIEW_LABEL_FONT_WEIGHT = '400';

interface ViewLabelDatum {
  // Corner of the view cell the label hangs from.
  position: [number, number];
  featureKey: string;
  name: string;
  placement: ViewLabelPlacement;
}

interface ViewLabelsLayerOptions {
  config: VuesLayerConfig;
  labels: ReadonlyMap<string, ViewLabel> | undefined;
  projection: ProjectionLike | undefined;
  modelMatrix: Matrix4 | null | undefined;
  layerId: string;
  pageDisplayScale: number;
}

function isBottomPlacement(placement: ViewLabelPlacement): boolean {
  return placement === 'bottom-inside' || placement === 'bottom-outside';
}

/**
 * Names of the views of a composite projection, in the corner of each cell.
 * Any other projection has no cells, hence no label. Sizes and offsets are in
 * page pixels, like every text of the layout.
 */
export function createViewLabelsLayers({
  config,
  labels,
  projection,
  modelMatrix,
  layerId,
  pageDisplayScale
}: ViewLabelsLayerOptions): Layer<DeckDataRow>[] {
  if (!labels?.size || !fontAssetsStore.ready) return [];
  if (!projection || !hasCompositeGraticuleSubProjections(projection)) {
    return [];
  }

  const data: ViewLabelDatum[] = projection
    .getSubProjections()
    .flatMap(({ id, screenExtent }) => {
      const label = labels.get(id);
      if (!label || !screenExtent) return [];
      const [[x0, y0], [, y1]] = screenExtent;
      return [
        {
          position: [x0, isBottomPlacement(label.placement) ? y1 : y0],
          featureKey: id,
          name: label.name,
          placement: label.placement
        }
      ];
    });
  if (data.length === 0) return [];

  const size = config.labelSize;
  const fontFamily = resolveFontFamilyStack(config.labelFontFamily);
  const color = hexToRgb(config.color);
  const scale = pageDisplayScale;

  const resolveText = (datum: ViewLabelDatum): string =>
    labelLayoutStore.getText(VIEW_LABELS_LAYOUT_KEY, datum.featureKey)
      ?.primary ?? datum.name;

  const resolveHalfSize = (datum: ViewLabelDatum): LabelOffset => {
    const lines = resolveText(datum).split('\n');
    const width = Math.max(
      ...lines.map((line) =>
        measureTextWidth(line, size, fontFamily, VIEW_LABEL_FONT_WEIGHT)
      )
    );
    return [width / 2, (lines.length * size * DEFAULT_TEXT_LINE_HEIGHT) / 2];
  };

  const resolveDefaultCenter = (datum: ViewLabelDatum): LabelOffset => {
    const [hw, hh] = resolveHalfSize(datum);
    const x = VIEW_LABEL_INSET_PX + hw;
    switch (datum.placement) {
      case 'top-outside':
        return [x, -(VIEW_LABEL_GAP_PX + hh)];
      case 'bottom-inside':
        return [x, -(VIEW_LABEL_INSET_PX + hh)];
      case 'bottom-outside':
        return [x, VIEW_LABEL_GAP_PX + hh];
      default:
        return [x, VIEW_LABEL_INSET_PX + hh];
    }
  };

  const resolveCenter = (datum: ViewLabelDatum): LabelOffset =>
    labelLayoutStore.getOffset(VIEW_LABELS_LAYOUT_KEY, datum.featureKey) ??
    resolveDefaultCenter(datum);

  const glyphs = new Set<string>();
  for (const datum of data) {
    for (const char of resolveText(datum)) glyphs.add(char);
  }
  const characterSet = extendTextCharacterSet(glyphs);

  // Left-aligned block whose centre sits at `center`, so the lines of a
  // two-line name keep a common left edge.
  const buildLayer = (
    id: string,
    layerData: ViewLabelDatum[],
    centerFor: (datum: ViewLabelDatum) => LabelOffset
  ): Layer<DeckDataRow> =>
    new TextLayer<ViewLabelDatum>({
      id,
      data: layerData,
      getPosition: (datum) => datum.position,
      getText: resolveText,
      getColor: color,
      getSize: size,
      sizeUnits: 'pixels',
      sizeScale: scale,
      getTextAnchor: 'start',
      getAlignmentBaseline: 'center',
      getPixelOffset: (datum) => {
        const [cx, cy] = centerFor(datum);
        const [hw] = resolveHalfSize(datum);
        return [(cx - hw) * scale, cy * scale];
      },
      fontFamily,
      characterSet,
      fontSettings: resolveTextFontSettings(size * scale),
      lineHeight: DEFAULT_TEXT_LINE_HEIGHT,
      pickable: true,
      autoHighlight: false,
      modelMatrix: modelMatrix ?? undefined,
      updateTriggers: {
        getText: [labelLayoutStore.version],
        getColor: [config.color],
        getPixelOffset: [labelLayoutStore.version, size, scale]
      }
    }) as unknown as Layer<DeckDataRow>;

  const dragged = labelLayoutStore.draggedLabel;
  const drawn = data.filter(
    (datum) =>
      dragged?.vizId !== VIEW_LABELS_LAYOUT_KEY ||
      dragged.featureKey !== datum.featureKey
  );

  const editing: LabelEditingContext = {
    vizId: VIEW_LABELS_LAYOUT_KEY,
    pageDisplayScale: scale,
    resolveFeatureKey: (datum) =>
      (datum as unknown as ViewLabelDatum).featureKey,
    hasManualPosition: (datum) =>
      labelLayoutStore.getOffset(
        VIEW_LABELS_LAYOUT_KEY,
        (datum as unknown as ViewLabelDatum).featureKey
      ) !== undefined,
    resolveTexts: (datum) => {
      const view = datum as unknown as ViewLabelDatum;
      return {
        primary: resolveText(view),
        secondary: null,
        dataPrimary: view.name,
        dataSecondary: null
      };
    },
    resolveBlockCenter: (datum) =>
      resolveCenter(datum as unknown as ViewLabelDatum),
    resolveTextHalfSize: (datum) =>
      resolveHalfSize(datum as unknown as ViewLabelDatum),
    buildDragPreview: (datum: TextLayerDatum, center: LabelOffset) => [
      buildLayer(
        `${layerId}-drag-preview`,
        [datum as unknown as ViewLabelDatum],
        () => center
      ) as unknown as Layer
    ]
  };
  Object.assign(drawn, { khartisLabelEditing: editing });

  return [buildLayer(layerId, drawn, resolveCenter)];
}
