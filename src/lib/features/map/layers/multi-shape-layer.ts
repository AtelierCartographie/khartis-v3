/**
 * Extension of deck.gl ScatterplotLayer that renders multiple geometric shapes
 * via Signed Distance Functions (SDF) in the fragment shader. See issue #92.
 *
 * SDF math adapted from Inigo Quilez's 2D primitive reference collection
 * (https://iquilezles.org/articles/distfunctions2d/), MIT-style licensing preserved.
 */

import { ScatterplotLayer } from '@deck.gl/layers';

export enum ShapeTypeOrdinal {
  CIRCLE = 0,
  SQUARE = 1,
  BAR = 2,
  SPIKE = 3,
  CROSS = 4,
  DIAMOND = 5,
  TRIANGLE = 6,
  STAR = 7,
  RECTANGLE = 8
}

export const LINEAR_SHAPE_ORDINALS: readonly ShapeTypeOrdinal[] = [
  ShapeTypeOrdinal.BAR,
  ShapeTypeOrdinal.SPIKE
];

export function isLinearShapeOrdinal(shape: number): boolean {
  return LINEAR_SHAPE_ORDINALS.includes(shape);
}

const multiShapeModule = {
  name: 'multiShape',
  fs: `
    uniform multiShapeUniforms {
      float barWidth;
      float offsetX;
      float offsetY;
      float halfMask;
      float dashed;
      float dashLength;
      float gapLength;
    } multiShape;
  `,
  uniformTypes: {
    barWidth: 'f32',
    offsetX: 'f32',
    offsetY: 'f32',
    halfMask: 'f32',
    dashed: 'f32',
    dashLength: 'f32',
    gapLength: 'f32'
  }
};

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
        case 1: // SQUARE
            {
                vec2 pos = uv * outerRadiusPixels;
                return sdBox(pos, vec2(0.6 * outerRadiusPixels)) + outerRadiusPixels;
            }
        case 2: // BAR
            {
                float w = multiShape.barWidth;
                vec2 pos = uv * outerRadiusPixels;
                return sdBox(pos, vec2(w / 2.0, outerRadiusPixels)) + outerRadiusPixels;
            }
        case 3: // SPIKE
            {
                float w = multiShape.barWidth * 1.5;
                vec2 pos = vec2(uv.x, -uv.y) * outerRadiusPixels;
                pos.y += outerRadiusPixels;
                return sdIsoscelesTriangle(pos, vec2(w / 2.0, 2.0 * outerRadiusPixels)) + outerRadiusPixels;
            }
        case 4: // CROSS
            {
                vec2 pos = uv * outerRadiusPixels;
                float r = 0.7 * outerRadiusPixels;
                float thick = r / 3.0;
                return sdCross(pos, vec2(r, thick), 0.0) + outerRadiusPixels;
            }
        case 5: // DIAMOND
            {
                 vec2 pos = uv * outerRadiusPixels;
                 float d = abs(pos.x) + abs(pos.y);
                 return d - (0.7 * outerRadiusPixels) + outerRadiusPixels;
            }
        case 6: // TRIANGLE
            {
                vec2 pos = uv * outerRadiusPixels;
                float r = 0.7 * outerRadiusPixels;
                vec2 p = vec2(pos.x, -pos.y);
                return sdEquilateralTriangle(p, r) + outerRadiusPixels;
            }
        case 7: // STAR
            {
                vec2 rUV = rotate(uv, 0.31);
                return sdStar5(rUV, 5, 0.1) * radiusPixels / 0.8;
            }
        case 8: // RECTANGLE
            {
                vec2 pos = uv * outerRadiusPixels;
                vec2 size = vec2(outerRadiusPixels * 0.9, 0.27 * outerRadiusPixels);
                return sdBox(pos, size) + outerRadiusPixels;
            }
        default: // CIRCLE (0)
            {
                return length(uv) * radiusPixels / 0.7;
            }
    }
}

float getDashMask(vec2 uv) {
    if (multiShape.dashed < 0.5) {
        return 1.0;
    }

    float cycle = max(multiShape.dashLength + multiShape.gapLength, 0.0001);
    float approxPerimeter = max(TAU * max(outerRadiusPixels, 1.0), cycle);
    float repetitions = max(1.0, floor(approxPerimeter / cycle));
    float phase = fract((atan(uv.y, uv.x) + PI) / TAU * repetitions);
    float duty = clamp(multiShape.dashLength / cycle, 0.05, 0.95);
    return 1.0 - step(duty, phase);
}

void main(void) {
    geometry.uv = unitPosition;
    vec2 uv = unitPosition - vec2(multiShape.offsetX, multiShape.offsetY);

    if (multiShape.halfMask > 0.5 && multiShape.halfMask < 1.5 && uv.y < 0.0) discard;
    if (multiShape.halfMask > 1.5 && uv.y > 0.0) discard;

    float distToCenter = getDistance(uv, outerRadiusPixels, int(vShape), vRadius);

    float inShape = scatterplot.antialiasing
        ? smoothedge(distToCenter, outerRadiusPixels)
        : step(distToCenter, outerRadiusPixels);

    if (inShape == 0.0) discard;

    if (scatterplot.stroked > 0.5) {
        float lineMask = scatterplot.antialiasing
            ? smoothedge(innerUnitRadius * outerRadiusPixels, distToCenter)
            : step(innerUnitRadius * outerRadiusPixels, distToCenter);
        lineMask *= getDashMask(uv);

        if (scatterplot.filled > 0.5) {
            fragColor = mix(vFillColor, vLineColor, lineMask);
        } else {
            if (lineMask == 0.0) discard;
            fragColor = vec4(vLineColor.rgb, vLineColor.a * lineMask);
        }
    } else if (scatterplot.filled < 0.5) {
        discard;
    } else {
        fragColor = vFillColor;
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
  dashed?: boolean;
  dashLength?: number;
  gapLength?: number;
};

const defaultProps = {
  ...ScatterplotLayer.defaultProps,
  getShape: { type: 'accessor', value: 0 },
  barWidth: { type: 'number', value: 6 },
  offsetX: { type: 'number', value: 0 },
  offsetY: { type: 'number', value: 0 },
  halfMask: { type: 'number', value: 0 },
  dashed: { type: 'boolean', value: false },
  dashLength: { type: 'number', value: 3 },
  gapLength: { type: 'number', value: 2 }
};

interface MultiShapeLayerState {
  model?: {
    shaderInputs?: {
      setProps: (props: Record<string, unknown>) => void;
    };
  };
}

/**
 * Extends deck.gl's ScatterplotLayer with an `instanceShapes` attribute and an
 * SDF fragment shader that dispatches on shape type.
 */
export class MultiShapeLayer<DataT = unknown> extends ScatterplotLayer<
  DataT,
  MultiShapeLayerProps<DataT>
> {
  static layerName = 'MultiShapeLayer';

  static defaultProps = defaultProps;

  initializeState(): void {
    super.initializeState();

    const attributeManager = this.getAttributeManager();
    if (!attributeManager) return;
    attributeManager.addInstanced({
      instanceShapes: {
        size: 1,
        accessor: 'getShape'
      }
    });
  }

  getShaders(): Record<string, unknown> {
    const parentShaders = super.getShaders();
    const parentModules = (parentShaders.modules as unknown[]) ?? [];

    return {
      ...parentShaders,
      fs: fragmentShader,
      modules: [...parentModules, multiShapeModule],
      inject: {
        ...((parentShaders.inject as Record<string, string>) ?? {}),
        'vs:#decl': `
in float instanceShapes;
out float vShape;
out float vRadius;
`,
        'vs:#main-end': `
vShape = instanceShapes;
vRadius = instanceRadius;
`
      }
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
      dashed,
      dashLength,
      gapLength
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
          dashed: dashed ? 1 : 0,
          dashLength: dashLength ?? 3,
          gapLength: gapLength ?? 2
        }
      });
    }
    super.draw(opts);
  }
}
