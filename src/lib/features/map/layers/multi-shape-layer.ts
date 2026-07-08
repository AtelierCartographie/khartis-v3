import { ScatterplotLayer } from '@deck.gl/layers';
import {
  LINEAR_SHAPES,
  SHAPE_ORDINAL,
  ShapeType,
  SYMBOL_SDF_EXTENT
} from '$lib/features/commons/constants/visualization.constants';
import type { TextureSource } from '@deck.gl/core';
import type { Texture } from '@luma.gl/core';

export const ShapeTypeOrdinal = {
  CIRCLE: SHAPE_ORDINAL[ShapeType.CIRCLE],
  SQUARE: SHAPE_ORDINAL[ShapeType.SQUARE],
  BAR: SHAPE_ORDINAL[ShapeType.BAR],
  SPIKE: SHAPE_ORDINAL[ShapeType.SPIKE],
  CROSS: SHAPE_ORDINAL[ShapeType.CROSS],
  DIAMOND: SHAPE_ORDINAL[ShapeType.DIAMOND],
  TRIANGLE: SHAPE_ORDINAL[ShapeType.TRIANGLE],
  STAR: SHAPE_ORDINAL[ShapeType.STAR],
  RECTANGLE: SHAPE_ORDINAL[ShapeType.RECTANGLE]
} as const;

export type ShapeTypeOrdinal =
  (typeof ShapeTypeOrdinal)[keyof typeof ShapeTypeOrdinal];

export const LINEAR_SHAPE_ORDINALS: readonly ShapeTypeOrdinal[] =
  LINEAR_SHAPES.map((shape) => SHAPE_ORDINAL[shape]);

type MultiShapeModuleProps = {
  barWidth?: number;
  offsetX?: number;
  offsetY?: number;
  halfMask?: number;
  shapeScale?: number;
  dashed?: number;
  dashLength?: number;
  gapLength?: number;
  dotLength?: number;
  dotGap?: number;
  patternEnabled?: number;
  patternScale?: number;
  patternAngle?: number;
  patternColor?: [number, number, number];
  patternColorize?: number;
  patternFrame?: [number, number, number, number];
  patternTexture?: Texture;
};

function getMultiShapeUniforms(
  opts?: MultiShapeModuleProps | Record<string, never>
): Record<string, unknown> {
  if (!opts) {
    return {};
  }
  const { patternTexture, ...scalars } = opts as MultiShapeModuleProps;
  if (!patternTexture) {
    return scalars;
  }
  return {
    ...scalars,
    multiShape_patternTexture: patternTexture,
    patternTextureSize: [patternTexture.width, patternTexture.height]
  };
}

const multiShapeModule = {
  name: 'multiShape',
  fs: `
    uniform multiShapeUniforms {
      float barWidth;
      float offsetX;
      float offsetY;
      float halfMask;
      float shapeScale;
      float dashed;
      float dashLength;
      float gapLength;
      float dotLength;
      float dotGap;
      float patternEnabled;
      float patternScale;
      float patternAngle;
      vec3 patternColor;
      float patternColorize;
      vec4 patternFrame;
      vec2 patternTextureSize;
    } multiShape;

    uniform sampler2D multiShape_patternTexture;
  `,
  getUniforms: getMultiShapeUniforms,
  uniformTypes: {
    barWidth: 'f32',
    offsetX: 'f32',
    offsetY: 'f32',
    halfMask: 'f32',
    shapeScale: 'f32',
    dashed: 'f32',
    dashLength: 'f32',
    gapLength: 'f32',
    dotLength: 'f32',
    dotGap: 'f32',
    patternEnabled: 'f32',
    patternScale: 'f32',
    patternAngle: 'f32',
    patternColor: 'vec3<f32>',
    patternColorize: 'f32',
    patternFrame: 'vec4<f32>',
    patternTextureSize: 'vec2<f32>'
  }
} as const;

const LINEAR_SHAPE_GLSL_CONDITION = LINEAR_SHAPE_ORDINALS.map(
  (ordinal) => `shapeOrdinal == ${ordinal}`
).join(' || ');

// Mirrors @deck.gl/layers ScatterplotLayer's vertex shader (9.3.x), with two
// additions. (1) Linear shapes (BAR/SPIKE) encode the value as a height, so
// their quad is lifted by half its height along its local +y axis (the SPIKE
// apex direction in the fragment SDF) to anchor the shape's base on the data
// point; area shapes keep the default centered anchoring. (2) The quad of 2D
// shapes is scaled by 1/SYMBOL_SDF_EXTENT so their visual weight matches the
// stock ScatterplotLayer circle. A shader-hook injection cannot do either:
// luma.gl emits hook functions before the main shader source, where
// outerRadiusPixels is not yet declared.
const vertexShader = `#version 300 es
#define SHADER_NAME multi-shape-layer-vertex-shader

in vec3 positions;
in vec3 instancePositions;
in vec3 instancePositions64Low;
in float instanceRadius;
in float instanceLineWidths;
in vec4 instanceFillColors;
in vec4 instanceLineColors;
in vec3 instancePickingColors;
in vec2 instancePixelOffset;
in float instanceShapes;

out vec4 vFillColor;
out vec4 vLineColor;
out vec2 unitPosition;
out float innerUnitRadius;
out float outerRadiusPixels;
out float vShape;
out float vRadius;

bool isBottomAnchoredShape(float shape) {
  int shapeOrdinal = int(shape + 0.5);
  return ${LINEAR_SHAPE_GLSL_CONDITION};
}

void main(void) {
  geometry.worldPosition = instancePositions;

  outerRadiusPixels = clamp(
    project_size_to_pixel(scatterplot.radiusScale * instanceRadius, scatterplot.radiusUnits),
    scatterplot.radiusMinPixels, scatterplot.radiusMaxPixels
  );

  // 2D SDF shapes occupy SYMBOL_SDF_EXTENT of the quad: grow the quad by the
  // inverse so the SDF circle matches the stock ScatterplotLayer circle and
  // the legend radius. Linear shapes already span the full quad height.
  if (!isBottomAnchoredShape(instanceShapes)) {
    outerRadiusPixels /= ${SYMBOL_SDF_EXTENT};
  }

  float lineWidthPixels = clamp(
    project_size_to_pixel(scatterplot.lineWidthScale * instanceLineWidths, scatterplot.lineWidthUnits),
    scatterplot.lineWidthMinPixels, scatterplot.lineWidthMaxPixels
  );

  outerRadiusPixels += scatterplot.stroked * lineWidthPixels / 2.0;

  float edgePadding = scatterplot.antialiasing
    ? (outerRadiusPixels + SMOOTH_EDGE_RADIUS) / outerRadiusPixels
    : 1.0;

  unitPosition = edgePadding * positions.xy;
  geometry.uv = unitPosition;
  geometry.pickingColor = instancePickingColors;

  innerUnitRadius = 1.0 - scatterplot.stroked * lineWidthPixels / outerRadiusPixels;

  vShape = instanceShapes;
  vRadius = instanceRadius;

  float anchorShiftPixels = isBottomAnchoredShape(instanceShapes)
    ? outerRadiusPixels
    : 0.0;

  if (scatterplot.billboard) {
    gl_Position = project_position_to_clipspace(instancePositions, instancePositions64Low, vec3(0.0), geometry.position);
    DECKGL_FILTER_GL_POSITION(gl_Position, geometry);
    vec3 offset = edgePadding * positions * outerRadiusPixels;
    offset.y += anchorShiftPixels;
    offset.xy += instancePixelOffset;
    DECKGL_FILTER_SIZE(offset, geometry);
    gl_Position.xy += project_pixel_size_to_clipspace(offset.xy);
  } else {
    vec3 offset = edgePadding * positions * project_pixel_size(outerRadiusPixels);
    offset.y += project_pixel_size(anchorShiftPixels);
    offset.xy += project_pixel_size(instancePixelOffset);
    DECKGL_FILTER_SIZE(offset, geometry);
    gl_Position = project_position_to_clipspace(instancePositions, instancePositions64Low, offset, geometry.position);
    DECKGL_FILTER_GL_POSITION(gl_Position, geometry);
  }

  vFillColor = vec4(instanceFillColors.rgb, instanceFillColors.a * layer.opacity);
  DECKGL_FILTER_COLOR(vFillColor, geometry);
  vLineColor = vec4(instanceLineColors.rgb, instanceLineColors.a * layer.opacity);
  DECKGL_FILTER_COLOR(vLineColor, geometry);
}
`;

const fragmentShader = `#version 300 es
#define SHADER_NAME multi-shape-layer-fragment-shader

precision highp float;

in float vShape;
in float vRadius;
in vec4 vFillColor;
in vec4 vLineColor;
in vec2 unitPosition;
in float innerUnitRadius;
in float outerRadiusPixels;

out vec4 fragColor;

#define PI 3.1415926535897932384626433832795
#define TAU 6.2831853071795864769252867665590

mat2 rotate2d(const in float angle) {
    float c = cos(angle);
    float s = sin(angle);
    return mat2(c, s, -s, c);
}

vec2 rotate(in vec2 v, in float angle) {
    return rotate2d(angle) * v;
}

float sdCross(in vec2 p, in vec2 b, float r) {
    p = abs(p);
    p = (p.y > p.x) ? p.yx : p.xy;
    vec2  q = p - b;
    float k = max(q.y, q.x);
    vec2  w = (k > 0.0) ? q : vec2(b.y - p.x, -k);
    return sign(k) * length(max(w, 0.0)) + r;
}

float sdEquilateralTriangle(in vec2 p, in float r) {
    const float k = sqrt(3.0);
    p.x = abs(p.x) - r;
    p.y = p.y + r/k;
    if(p.x + k*p.y > 0.0) p = vec2(p.x - k*p.y, -k*p.x - p.y) / 2.0;
    p.x -= clamp(p.x, -2.0*r, 0.0);
    return -length(p) * sign(p.y);
}

float sdStar5(in vec2 st, in int branches, in float s) {
    st *= 3.2;
    float a = atan(st.y, st.x) / TAU;
    float seg = a * float(branches);
    a = ((floor(seg) + 0.5) / float(branches) +
        mix(s, -s, step(0.5, fract(seg)))) * TAU;
    return abs(dot(vec2(cos(a), sin(a)), st));
}

float sdBox(in vec2 p, in vec2 b) {
    vec2 d = abs(p) - b;
    return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}

float sdIsoscelesTriangle(in vec2 p, in vec2 q) {
    p.x = abs(p.x);
    vec2 a = p - q * clamp(dot(p, q) / dot(q, q), 0.0, 1.0);
    vec2 b = p - q * vec2(clamp(p.x / q.x, 0.0, 1.0), 1.0);
    float k = sign(q.y);
    float d = min(dot(a, a), dot(b, b));
    float s = max(k * (p.x * q.y - p.y * q.x), k * (p.y - q.y));
    return sqrt(d) * sign(s);
}

float getDistance(vec2 uv, float radiusPixels, int shapeType, float radius) {
    switch (shapeType) {
        case ${ShapeTypeOrdinal.SQUARE}: // SQUARE
            {
                vec2 pos = uv * outerRadiusPixels;
                return sdBox(pos, vec2(0.6 * outerRadiusPixels)) + outerRadiusPixels;
            }
        case ${ShapeTypeOrdinal.BAR}: // BAR
            {
                float w = multiShape.barWidth;
                vec2 pos = uv * outerRadiusPixels;
                return sdBox(pos, vec2(w / 2.0, outerRadiusPixels)) + outerRadiusPixels;
            }
        case ${ShapeTypeOrdinal.SPIKE}: // SPIKE
            {
                float w = multiShape.barWidth * 1.5;
                vec2 pos = vec2(uv.x, -uv.y) * outerRadiusPixels;
                pos.y += outerRadiusPixels;
                return sdIsoscelesTriangle(pos, vec2(w / 2.0, 2.0 * outerRadiusPixels)) + outerRadiusPixels;
            }
        case ${ShapeTypeOrdinal.CROSS}: // CROSS
            {
                vec2 pos = uv * outerRadiusPixels;
                float r = 0.7 * outerRadiusPixels;
                float thick = r / 3.0;
                return sdCross(pos, vec2(r, thick), 0.0) + outerRadiusPixels;
            }
        case ${ShapeTypeOrdinal.DIAMOND}: // DIAMOND
            {
                 vec2 pos = uv * outerRadiusPixels;
                 float d = abs(pos.x) + abs(pos.y);
                 return d - (0.7 * outerRadiusPixels) + outerRadiusPixels;
            }
        case ${ShapeTypeOrdinal.TRIANGLE}: // TRIANGLE
            {
                vec2 pos = uv * outerRadiusPixels;
                float r = 0.7 * outerRadiusPixels;
                return sdEquilateralTriangle(pos, r) + outerRadiusPixels;
            }
        case ${ShapeTypeOrdinal.STAR}: // STAR
            {
                vec2 rUV = rotate(uv, 0.31);
                return sdStar5(rUV, 5, 0.1) * radiusPixels / 0.8;
            }
        case ${ShapeTypeOrdinal.RECTANGLE}: // RECTANGLE
            {
                vec2 pos = uv * outerRadiusPixels;
                vec2 size = vec2(outerRadiusPixels * 0.9, 0.27 * outerRadiusPixels);
                return sdBox(pos, size) + outerRadiusPixels;
            }
        default: // CIRCLE (0)
            {
                // True euclidean distance (not a scaled one) so stroke width
                // and antialiasing stay in real pixels, like the other SDFs.
                return (length(uv) - ${SYMBOL_SDF_EXTENT}) * radiusPixels + radiusPixels;
            }
    }
}

float getDashMask(vec2 uv, float strokePx, float midRadiusPx, float radialOffsetPx) {
    if (multiShape.dashed < 0.5) {
        return 1.0;
    }

    float sw = max(strokePx, 1.0);
    float a = multiShape.dashLength * sw;
    float b = multiShape.gapLength * sw;
    float c = multiShape.dotLength * sw;
    float d = multiShape.dotGap * sw;
    float cycle = max(a + b + c + d, 0.0001);
    float perimeter = max(TAU * max(midRadiusPx, 1.0), cycle);
    float reps = max(1.0, floor(perimeter / cycle));
    float arcPos = fract((atan(uv.y, uv.x) + PI) / TAU * reps) * cycle;

    // Solid dash segment [0, a).
    float mask = 1.0 - step(a, arcPos);
    // Real round dot centered at a + b + c/2 (radius c/2 ~= stroke half-width).
    if (c > 0.0) {
        float dotCenter = a + b + c * 0.5;
        float distToDot = length(vec2(arcPos - dotCenter, radialOffsetPx));
        mask += 1.0 - step(c * 0.5, distToDot);
    }
    return clamp(mask, 0.0, 1.0);
}

vec4 applyFillPattern(vec4 fillColor, vec2 scaledUv) {
    if (multiShape.patternEnabled < 0.5 || fillColor.a <= 0.0) {
        return fillColor;
    }

    vec2 pxPos = scaledUv * outerRadiusPixels;
    float c = cos(radians(multiShape.patternAngle));
    float s = sin(radians(multiShape.patternAngle));
    vec2 rp = mat2(c, s, -s, c) * pxPos;
    vec2 tileUV = fract(rp / max(multiShape.patternScale, 0.0001));
    vec2 texUV = (multiShape.patternFrame.xy + multiShape.patternFrame.zw * tileUV) / multiShape.patternTextureSize;
    float mask = texture(multiShape_patternTexture, texUV).a;

    vec3 base = vec3(1.0);
    vec3 motifColor = multiShape.patternColorize > 0.5
        ? fillColor.rgb
        : multiShape.patternColor / 255.0;
    return vec4(mix(base, motifColor, mask), fillColor.a);
}

void main(void) {
    geometry.uv = unitPosition;
    vec2 uv = unitPosition - vec2(multiShape.offsetX, multiShape.offsetY);
    vec2 scaledUv = uv / max(multiShape.shapeScale, 0.0001);

    if (multiShape.halfMask > 0.5 && multiShape.halfMask < 1.5 && uv.y < 0.0) discard;
    if (multiShape.halfMask > 1.5 && uv.y > 0.0) discard;

    float distToCenter = getDistance(scaledUv, outerRadiusPixels, int(vShape), vRadius);

    float inShape = scatterplot.antialiasing
        ? smoothedge(distToCenter, outerRadiusPixels)
        : step(distToCenter, outerRadiusPixels);

    if (inShape == 0.0) discard;

    if (scatterplot.stroked > 0.5) {
        float innerEdge = innerUnitRadius * outerRadiusPixels;
        float strokePx = max(outerRadiusPixels - innerEdge, 1.0);
        float midRadiusPx = (innerEdge + outerRadiusPixels) * 0.5;
        float lineMask = scatterplot.antialiasing
            ? smoothedge(innerEdge, distToCenter)
            : step(innerEdge, distToCenter);
        lineMask *= getDashMask(scaledUv, strokePx, midRadiusPx, distToCenter - midRadiusPx);
        vec4 fillColor = applyFillPattern(vFillColor, scaledUv);

        if (scatterplot.filled > 0.5) {
            fragColor = mix(fillColor, vLineColor, lineMask);
        } else {
            if (lineMask == 0.0) discard;
            fragColor = vec4(vLineColor.rgb, vLineColor.a * lineMask);
        }
    } else if (scatterplot.filled < 0.5) {
        discard;
    } else {
        fragColor = applyFillPattern(vFillColor, scaledUv);
    }

    fragColor.a *= inShape;
    DECKGL_FILTER_COLOR(fragColor, geometry);
}
`;

export type HalfMaskMode = 0 | 1 | 2;

export type MultiShapeLayerProps<DataT = unknown> = {
  getShape?: number | ((d: DataT) => number);
  barWidth?: number;
  offsetX?: number;
  offsetY?: number;
  halfMask?: HalfMaskMode;
  shapeScale?: number;
  dashed?: boolean;
  dashLength?: number;
  gapLength?: number;
  dotLength?: number;
  dotGap?: number;
  patternEnabled?: boolean;
  patternAtlas?: string | TextureSource;
  patternFrame?: [number, number, number, number];
  patternScale?: number;
  patternAngle?: number;
  patternColor?: [number, number, number];
  patternColorize?: boolean;
};

const defaultProps = {
  ...ScatterplotLayer.defaultProps,
  getShape: { type: 'accessor', value: 0 },
  barWidth: { type: 'number', value: 6 },
  offsetX: { type: 'number', value: 0 },
  offsetY: { type: 'number', value: 0 },
  halfMask: { type: 'number', value: 0 },
  shapeScale: { type: 'number', value: 1 },
  dashed: { type: 'boolean', value: false },
  dashLength: { type: 'number', value: 3 },
  gapLength: { type: 'number', value: 2 },
  dotLength: { type: 'number', value: 0 },
  dotGap: { type: 'number', value: 0 },
  patternEnabled: { type: 'boolean', value: false },
  patternAtlas: {
    type: 'image',
    value: null,
    async: true,
    parameters: { lodMaxClamp: 0 }
  },
  patternFrame: { type: 'array', value: [0, 0, 0, 0] },
  patternScale: { type: 'number', value: 1 },
  patternAngle: { type: 'number', value: 0 },
  patternColor: { type: 'array', value: [0, 0, 0] },
  patternColorize: { type: 'boolean', value: false }
};

interface MultiShapeLayerState {
  model?: {
    shaderInputs?: {
      setProps: (props: Record<string, unknown>) => void;
    };
  };
  emptyTexture?: Texture;
}

export class MultiShapeLayer<DataT = unknown> extends ScatterplotLayer<
  DataT,
  MultiShapeLayerProps<DataT>
> {
  static layerName = 'MultiShapeLayer';

  static defaultProps = defaultProps;

  initializeState(): void {
    super.initializeState();

    const attributeManager = this.getAttributeManager();
    if (attributeManager) {
      attributeManager.addInstanced({
        instanceShapes: {
          size: 1,
          accessor: 'getShape'
        }
      });
    }

    this.setState({
      emptyTexture: this.context.device.createTexture({
        data: new Uint8Array(4),
        width: 1,
        height: 1
      })
    });
  }

  finalizeState(
    context: Parameters<
      ScatterplotLayer<DataT, MultiShapeLayerProps<DataT>>['finalizeState']
    >[0]
  ): void {
    const state = this.state as unknown as MultiShapeLayerState;
    state.emptyTexture?.delete();
    super.finalizeState(context);
  }

  getShaders(): Record<string, unknown> {
    const parentShaders = super.getShaders();
    const parentModules = (parentShaders.modules as unknown[]) ?? [];

    return {
      ...parentShaders,
      vs: vertexShader,
      fs: fragmentShader,
      modules: [...parentModules, multiShapeModule]
    };
  }

  draw(
    opts: Parameters<
      ScatterplotLayer<DataT, MultiShapeLayerProps<DataT>>['draw']
    >[0]
  ): void {
    const {
      barWidth,
      offsetX,
      offsetY,
      halfMask,
      shapeScale,
      dashed,
      dashLength,
      gapLength,
      dotLength,
      dotGap,
      patternEnabled,
      patternAtlas,
      patternFrame,
      patternScale,
      patternAngle,
      patternColor,
      patternColorize
    } = this.props;
    const state = this.state as unknown as MultiShapeLayerState;
    const shaderInputs = state.model?.shaderInputs;
    if (shaderInputs) {
      shaderInputs.setProps({
        multiShape: {
          barWidth,
          offsetX: offsetX ?? 0,
          offsetY: offsetY ?? 0,
          halfMask: halfMask ?? 0,
          shapeScale: shapeScale ?? 1,
          dashed: dashed ? 1 : 0,
          dashLength: dashLength ?? 3,
          gapLength: gapLength ?? 2,
          dotLength: dotLength ?? 0,
          dotGap: dotGap ?? 0,
          patternEnabled: patternEnabled ? 1 : 0,
          patternScale: patternScale ?? 1,
          patternAngle: patternAngle ?? 0,
          patternColor: patternColor ?? [0, 0, 0],
          patternColorize: patternColorize ? 1 : 0,
          patternFrame: patternFrame ?? [0, 0, 0, 0],
          patternTexture: (patternAtlas as Texture) ?? state.emptyTexture
        }
      });
    }
    super.draw(opts);
  }
}
