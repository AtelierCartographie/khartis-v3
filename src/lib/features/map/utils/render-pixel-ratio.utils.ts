const DEFAULT_RENDER_PIXEL_RATIO = 1;

export const MAX_MAP_RENDER_PIXEL_RATIO = 4;
export const DEFAULT_MAX_RENDER_BUFFER_SIZE_PX = 4096;

export const MIN_DEVICE_PIXEL_RATIO_TARGET = 2;

let cachedBrowserMaxRenderBufferSizePx: number | null = null;

function normalizePositiveInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : null;
}

function getWebGLMaxRenderBufferSizePx(
  gl: WebGLRenderingContext | WebGL2RenderingContext
): number {
  const maxTextureSize = normalizePositiveInteger(
    gl.getParameter(gl.MAX_TEXTURE_SIZE)
  );
  const maxRenderbufferSize = normalizePositiveInteger(
    gl.getParameter(gl.MAX_RENDERBUFFER_SIZE)
  );
  const limits = [maxTextureSize, maxRenderbufferSize].filter(
    (limit): limit is number => limit !== null
  );

  return limits.length > 0
    ? Math.min(...limits)
    : DEFAULT_MAX_RENDER_BUFFER_SIZE_PX;
}

export function getBrowserMaxRenderBufferSizePx(): number {
  if (cachedBrowserMaxRenderBufferSizePx !== null) {
    return cachedBrowserMaxRenderBufferSizePx;
  }

  if (typeof document === 'undefined') {
    return DEFAULT_MAX_RENDER_BUFFER_SIZE_PX;
  }

  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');

    if (!gl) {
      cachedBrowserMaxRenderBufferSizePx = DEFAULT_MAX_RENDER_BUFFER_SIZE_PX;
      return cachedBrowserMaxRenderBufferSizePx;
    }

    cachedBrowserMaxRenderBufferSizePx = getWebGLMaxRenderBufferSizePx(gl);
    gl.getExtension('WEBGL_lose_context')?.loseContext();

    return cachedBrowserMaxRenderBufferSizePx;
  } catch {
    cachedBrowserMaxRenderBufferSizePx = DEFAULT_MAX_RENDER_BUFFER_SIZE_PX;
    return cachedBrowserMaxRenderBufferSizePx;
  }
}

export function resolveMapRenderPixelRatio(
  devicePixelRatio: number,
  pageZoomScale = 1,
  maxViewportDimensionPx = 0,
  maxRenderBufferSizePx = DEFAULT_MAX_RENDER_BUFFER_SIZE_PX
): number {
  const normalizedDevicePixelRatio =
    Number.isFinite(devicePixelRatio) && devicePixelRatio > 0
      ? devicePixelRatio
      : DEFAULT_RENDER_PIXEL_RATIO;
  const normalizedPageZoomScale =
    Number.isFinite(pageZoomScale) && pageZoomScale > 0 ? pageZoomScale : 1;
  const normalizedViewportDimension =
    Number.isFinite(maxViewportDimensionPx) && maxViewportDimensionPx > 0
      ? maxViewportDimensionPx
      : 0;
  const normalizedMaxRenderBufferSize =
    Number.isFinite(maxRenderBufferSizePx) && maxRenderBufferSizePx > 0
      ? maxRenderBufferSizePx
      : DEFAULT_MAX_RENDER_BUFFER_SIZE_PX;
  const compensationScale = Math.max(1, normalizedPageZoomScale);
  const maxPixelRatioFromViewport =
    normalizedViewportDimension > 0
      ? normalizedMaxRenderBufferSize / normalizedViewportDimension
      : MAX_MAP_RENDER_PIXEL_RATIO;
  const targetDevicePixelRatio = Math.max(
    normalizedDevicePixelRatio,
    MIN_DEVICE_PIXEL_RATIO_TARGET
  );

  return Math.max(
    DEFAULT_RENDER_PIXEL_RATIO,
    Math.min(
      MAX_MAP_RENDER_PIXEL_RATIO,
      maxPixelRatioFromViewport,
      targetDevicePixelRatio * compensationScale
    )
  );
}
