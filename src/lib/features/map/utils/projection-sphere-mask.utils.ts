import {
  type Layer,
  type LayerExtension,
  type LayerProps
} from '@deck.gl/core';
import { MaskExtension } from '@deck.gl/extensions';
import { SolidPolygonLayer } from '@deck.gl/layers';
import type { Matrix4 } from '@math.gl/core';
import {
  parseSphere,
  type BinaryPolygonData,
  type ProjectionLike
} from 'geoarrow-deck-stream';
import type { DeckDataRow } from '../types';
import { createCompatibleSolidPolygonLayerProps } from './solid-polygon-layer-props.utils';

export const PROJECTION_SPHERE_MASK_LAYER_ID = 'projection-sphere-mask';

const projectionSphereMaskExtension = new MaskExtension();

type MaskedLayerProps = Partial<LayerProps> & { maskId: string };

function isD3StreamProjection(
  projection: ProjectionLike | undefined
): projection is ProjectionLike {
  return typeof projection?.stream === 'function';
}

export function createProjectionSphereMaskLayer({
  projection,
  modelMatrix
}: {
  projection: ProjectionLike | undefined;
  modelMatrix: Matrix4 | null | undefined;
}): Layer<DeckDataRow> | null {
  if (!isD3StreamProjection(projection)) {
    return null;
  }

  const sphereData = parseSphere(projection, {
    output: 'polygon'
  }) as BinaryPolygonData;

  return new SolidPolygonLayer({
    id: PROJECTION_SPHERE_MASK_LAYER_ID,
    ...createCompatibleSolidPolygonLayerProps(sphereData),
    operation: 'mask',
    pickable: false,
    ...(modelMatrix && { modelMatrix })
  });
}

export function applyProjectionSphereMask(
  layers: Layer<DeckDataRow>[],
  maskLayer: Layer<DeckDataRow> | null
): Layer<DeckDataRow>[] {
  if (!maskLayer) {
    return layers;
  }

  return [
    maskLayer,
    ...layers.map((layer) => {
      const maskedProps: MaskedLayerProps = {
        extensions: [
          ...((layer.props.extensions as LayerExtension[] | undefined) ?? []),
          projectionSphereMaskExtension
        ],
        maskId: PROJECTION_SPHERE_MASK_LAYER_ID
      };

      return layer.clone(maskedProps);
    })
  ] as Layer<DeckDataRow>[];
}
