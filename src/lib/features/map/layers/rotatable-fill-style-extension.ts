import { LayerExtension } from '@deck.gl/core';
import { project, fp64LowPart } from '@deck.gl/core';

import type {
  Layer,
  LayerContext,
  DefaultProps,
  Accessor,
  AccessorFunction,
  TextureSource,
  UpdateParameters,
  ProjectProps,
  ProjectUniforms
} from '@deck.gl/core';
import type { Texture } from '@luma.gl/core';

const uniformBlock = /* glsl */ `\
uniform fillUniforms {
  vec2 patternTextureSize;
  bool patternEnabled;
  bool patternMask;
  vec2 uvCoordinateOrigin;
  vec2 uvCoordinateOrigin64Low;
} fill;
`;

const patternVs = /* glsl */ `
in vec4 fillPatternFrames;
in float fillPatternScales;
in vec2 fillPatternOffsets;
in float fillPatternRotations;

out vec2 fill_uv;
out vec4 fill_patternBounds;
out vec4 fill_patternPlacement;
out float fill_patternRotation;
`;

const vs = `
${uniformBlock}
${patternVs}
`;

const patternFs = /* glsl */ `
uniform sampler2D fill_patternTexture;

in vec4 fill_patternBounds;
in vec4 fill_patternPlacement;
in vec2 fill_uv;
in float fill_patternRotation;

const float FILL_UV_SCALE = 512.0 / 40000000.0;
`;

const fs = `
${uniformBlock}
${patternFs}
`;

const inject = {
  'vs:DECKGL_FILTER_GL_POSITION': /* glsl */ `
    fill_uv = geometry.position.xy;
  `,

  'vs:DECKGL_FILTER_COLOR': /* glsl */ `
    if (fill.patternEnabled) {
      fill_patternBounds = fillPatternFrames / vec4(fill.patternTextureSize, fill.patternTextureSize);
      fill_patternPlacement.xy = fillPatternOffsets;
      fill_patternPlacement.zw = fillPatternScales * fillPatternFrames.zw;
      fill_patternRotation = radians(fillPatternRotations);
    }
  `,

  'fs:DECKGL_FILTER_COLOR': /* glsl */ `
    if (fill.patternEnabled) {
      vec2 scale = FILL_UV_SCALE * fill_patternPlacement.zw;

      vec2 worldPos = fill.uvCoordinateOrigin + fill.uvCoordinateOrigin64Low + fill_uv;

      float c = cos(fill_patternRotation);
      float s = sin(fill_patternRotation);
      mat2 rotationMatrix = mat2(c, s, -s, c);
      vec2 rotatedPos = rotationMatrix * worldPos;

      vec2 patternUV = mod(rotatedPos, scale) / scale;

      patternUV = mod(fill_patternPlacement.xy + patternUV, 1.0);

      vec2 texCoords = fill_patternBounds.xy + fill_patternBounds.zw * patternUV;

      vec4 patternColor = texture(fill_patternTexture, texCoords);
      color.a *= patternColor.a;
      if (!fill.patternMask) {
        color.rgb = patternColor.rgb;
      }
    }
  `
};

type FillStyleModuleProps = {
  project: ProjectProps;
  fillPatternEnabled?: boolean;
  fillPatternMask?: boolean;
  fillPatternTexture: Texture;
};

type FillStyleModuleUniforms = {
  patternTextureSize?: [number, number];
  patternEnabled?: boolean;
  patternMask?: boolean;
  uvCoordinateOrigin?: [number, number];
  uvCoordinateOrigin64Low?: [number, number];
};

type FillStyleModuleBindings = {
  fill_patternTexture?: Texture;
};

function getPatternUniforms(
  opts?: FillStyleModuleProps | Record<string, never>
): FillStyleModuleBindings & FillStyleModuleUniforms {
  if (!opts) {
    return {};
  }
  const uniforms: FillStyleModuleBindings & FillStyleModuleUniforms = {};
  if ('fillPatternTexture' in opts) {
    const { fillPatternTexture } = opts;
    uniforms.fill_patternTexture = fillPatternTexture;
    uniforms.patternTextureSize = [
      fillPatternTexture.width,
      fillPatternTexture.height
    ];
  }
  if ('project' in opts) {
    const { fillPatternMask = true, fillPatternEnabled = true } = opts;
    const projectUniforms = project.getUniforms(
      opts.project
    ) as ProjectUniforms;
    const { commonOrigin: coordinateOriginCommon } = projectUniforms;

    const coordinateOriginCommon64Low: [number, number] = [
      fp64LowPart(coordinateOriginCommon[0]),
      fp64LowPart(coordinateOriginCommon[1])
    ];

    uniforms.uvCoordinateOrigin = coordinateOriginCommon.slice(0, 2) as [
      number,
      number
    ];
    uniforms.uvCoordinateOrigin64Low = coordinateOriginCommon64Low;
    uniforms.patternMask = fillPatternMask;
    uniforms.patternEnabled = fillPatternEnabled;
  }
  return uniforms;
}

const patternShaders = {
  name: 'fill',
  vs,
  fs,
  inject,
  dependencies: [project],
  getUniforms: getPatternUniforms,
  uniformTypes: {
    patternTextureSize: 'vec2<f32>',
    patternEnabled: 'i32',
    patternMask: 'i32',
    uvCoordinateOrigin: 'vec2<f32>',
    uvCoordinateOrigin64Low: 'vec2<f32>'
  }
} as const;

export type RotatableFillStyleExtensionProps<DataT = unknown> = {
  fillPatternEnabled?: boolean;
  fillPatternAtlas?: string | TextureSource;
  fillPatternMapping?:
    | string
    | Record<string, { x: number; y: number; width: number; height: number }>;
  fillPatternMask?: boolean;
  getFillPattern?: AccessorFunction<DataT, string>;
  getFillPatternScale?: Accessor<DataT, number>;
  getFillPatternOffset?: Accessor<DataT, [number, number]>;
  getFillPatternRotation?: Accessor<DataT, number>;
};

export type RotatableFillStyleExtensionOptions = {
  pattern?: boolean;
};

const defaultProps: DefaultProps<RotatableFillStyleExtensionProps> = {
  fillPatternEnabled: true,
  fillPatternAtlas: {
    type: 'image',
    value: null,
    async: true,
    parameters: { lodMaxClamp: 0 }
  },
  fillPatternMapping: { type: 'object', value: {}, async: true },
  fillPatternMask: true,
  getFillPattern: {
    type: 'accessor',
    value: (d: unknown) => (d as { pattern: string }).pattern
  },
  getFillPatternScale: { type: 'accessor', value: 1 },
  getFillPatternOffset: { type: 'accessor', value: [0, 0] },
  getFillPatternRotation: { type: 'accessor', value: 0 }
};

export default class RotatableFillStyleExtension extends LayerExtension<RotatableFillStyleExtensionOptions> {
  static defaultProps = defaultProps;

  static extensionName = 'RotatableFillStyleExtension';

  constructor({
    pattern = false
  }: Partial<RotatableFillStyleExtensionOptions> = {}) {
    super({ pattern });
  }

  isEnabled(layer: Layer<RotatableFillStyleExtensionProps>): boolean {
    return (
      layer.getAttributeManager() !== null && !('pathTesselator' in layer.state)
    );
  }

  getShaders(
    this: Layer<RotatableFillStyleExtensionProps>,
    extension: this
  ): { modules: unknown[] } | null {
    if (!extension.isEnabled(this)) {
      return null;
    }
    return {
      modules: [extension.opts.pattern && patternShaders].filter(Boolean)
    };
  }

  initializeState(
    this: Layer<RotatableFillStyleExtensionProps>,
    _context: LayerContext,
    extension: this
  ) {
    if (!extension.isEnabled(this)) {
      return;
    }

    const attributeManager = this.getAttributeManager();

    if (extension.opts.pattern) {
      attributeManager!.add({
        fillPatternFrames: {
          size: 4,
          stepMode: 'dynamic',
          accessor: 'getFillPattern',
          transform: extension.getPatternFrame.bind(this)
        },
        fillPatternScales: {
          size: 1,
          stepMode: 'dynamic',
          accessor: 'getFillPatternScale',
          defaultValue: 1
        },
        fillPatternOffsets: {
          size: 2,
          stepMode: 'dynamic',
          accessor: 'getFillPatternOffset'
        },
        fillPatternRotations: {
          size: 1,
          stepMode: 'dynamic',
          accessor: 'getFillPatternRotation',
          defaultValue: 0
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

  updateState(
    this: Layer<RotatableFillStyleExtensionProps>,
    {
      props,
      oldProps
    }: UpdateParameters<Layer<RotatableFillStyleExtensionProps>>,
    extension: this
  ) {
    if (!extension.isEnabled(this)) {
      return;
    }

    if (
      props.fillPatternMapping &&
      props.fillPatternMapping !== oldProps.fillPatternMapping
    ) {
      this.getAttributeManager()!.invalidate('getFillPattern');
    }
  }

  draw(
    this: Layer<RotatableFillStyleExtensionProps>,
    params: { shaderModuleProps: { project: ProjectProps } },
    extension: this
  ) {
    if (!extension.isEnabled(this)) {
      return;
    }

    const { fillPatternAtlas, fillPatternEnabled, fillPatternMask } =
      this.props;
    const fillProps: FillStyleModuleProps = {
      project: params.shaderModuleProps.project,
      fillPatternEnabled,
      fillPatternMask,
      fillPatternTexture: (fillPatternAtlas ||
        this.state.emptyTexture) as Texture
    };
    this.setShaderModuleProps({ fill: fillProps });
  }

  finalizeState(this: Layer<RotatableFillStyleExtensionProps>) {
    const emptyTexture = this.state.emptyTexture as Texture;
    emptyTexture?.delete();
  }

  getPatternFrame(this: Layer<RotatableFillStyleExtensionProps>, name: string) {
    const { fillPatternMapping } = this.getCurrentLayer()!.props;
    if (!fillPatternMapping || typeof fillPatternMapping === 'string') {
      return [0, 0, 0, 0];
    }
    const def = fillPatternMapping[name];
    return def ? [def.x, def.y, def.width, def.height] : [0, 0, 0, 0];
  }
}
