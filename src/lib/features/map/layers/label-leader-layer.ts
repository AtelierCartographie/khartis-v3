import type { Accessor } from '@deck.gl/core';
import { LineLayer } from '@deck.gl/layers';

export interface LabelLeaderSegment {
  /** The feature anchor, in the layer's world coordinates. */
  position: [number, number];
  /** Segment ends in screen pixels from the anchor, y down. */
  source: [number, number];
  target: [number, number];
  color: [number, number, number, number];
}

export type LabelLeaderLayerProps<D = LabelLeaderSegment> = {
  getSourcePixelOffset?: Accessor<D, [number, number]>;
  getTargetPixelOffset?: Accessor<D, [number, number]>;
};

// The LineLayer vertex shader, with both ends anchored on one world point and
// displaced in screen pixels, so a leader keeps its length through zooms the
// way TextLayer's getPixelOffset does. Source and target positions are that
// same point; both are read so neither attribute goes unused.
const vs = `\
#version 300 es
#define SHADER_NAME label-leader-layer-vertex-shader
in vec3 positions;
in vec3 instanceSourcePositions;
in vec3 instanceTargetPositions;
in vec3 instanceSourcePositions64Low;
in vec3 instanceTargetPositions64Low;
in vec2 instanceSourcePixelOffsets;
in vec2 instanceTargetPixelOffsets;
in vec4 instanceColors;
in float instanceWidths;
out vec4 vColor;
out vec2 uv;
void main(void) {
  vec3 anchor_world = mix(instanceSourcePositions, instanceTargetPositions, 0.5);
  vec3 anchor_world_64low = mix(
    instanceSourcePositions64Low, instanceTargetPositions64Low, 0.5
  );
  geometry.worldPosition = anchor_world;
  vec4 anchor_commonspace;
  vec4 anchor = project_position_to_clipspace(
    anchor_world, anchor_world_64low, vec3(0.), anchor_commonspace
  );
  geometry.position = anchor_commonspace;
  uv = positions.xy;
  geometry.uv = uv;
  geometry.pickingColor = picking_getPickingColorFromInstanceID();

  vec2 source = instanceSourcePixelOffsets * vec2(1.0, -1.0);
  vec2 target = instanceTargetPixelOffsets * vec2(1.0, -1.0);
  vec2 delta = target - source;
  float segmentLength = length(delta);
  vec2 direction = segmentLength > 0.0 ? delta / segmentLength : vec2(1.0, 0.0);
  vec2 normal = vec2(-direction.y, direction.x);
  float widthPixels = clamp(
    project_size_to_pixel(instanceWidths * line.widthScale, line.widthUnits),
    line.widthMinPixels, line.widthMaxPixels
  );
  float segmentIndex = positions.x;
  // Square caps close the joint where an elbow's two segments meet.
  vec2 cap = direction * (segmentIndex * 2.0 - 1.0) * widthPixels / 2.0;
  vec3 offset = vec3(
    mix(source, target, segmentIndex) + cap + normal * positions.y * widthPixels / 2.0,
    0.0
  );
  DECKGL_FILTER_SIZE(offset, geometry);
  DECKGL_FILTER_GL_POSITION(anchor, geometry);
  gl_Position = anchor + vec4(project_pixel_size_to_clipspace(offset.xy), 0.0, 0.0);
  vColor = vec4(instanceColors.rgb, instanceColors.a * layer.opacity);
  DECKGL_FILTER_COLOR(vColor, geometry);
}
`;

const defaultProps = {
  ...LineLayer.defaultProps,
  getSourcePixelOffset: { type: 'accessor', value: [0, 0] },
  getTargetPixelOffset: { type: 'accessor', value: [0, 0] }
};

export class LabelLeaderLayer<D = LabelLeaderSegment> extends LineLayer<
  D,
  LabelLeaderLayerProps<D>
> {
  static layerName = 'LabelLeaderLayer';

  static defaultProps = defaultProps;

  getShaders() {
    return { ...super.getShaders(), vs };
  }

  initializeState(): void {
    super.initializeState();
    this.getAttributeManager()?.addInstanced({
      instanceSourcePixelOffsets: {
        size: 2,
        accessor: 'getSourcePixelOffset'
      },
      instanceTargetPixelOffsets: {
        size: 2,
        accessor: 'getTargetPixelOffset'
      }
    });
  }
}
