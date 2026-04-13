import {
  BasemapStyle,
  DEFAULT_TILED_BASEMAP_STYLE
} from '$lib/features/map/constants/basemap-styles';

export function resolveNextTiledStyleSelection(
  currentStyle: BasemapStyle,
  requestedStyle: BasemapStyle,
  hasActiveOSMBasemap: boolean
): BasemapStyle {
  if (requestedStyle === currentStyle && !hasActiveOSMBasemap) {
    return BasemapStyle.BLANK_WHITE;
  }

  return requestedStyle;
}

export function resolveTiledStyleContext(
  currentStyle: BasemapStyle,
  preferredStyle: BasemapStyle
): BasemapStyle {
  return currentStyle === BasemapStyle.BLANK_WHITE
    ? preferredStyle
    : currentStyle;
}

export function resolveTiledStyleFromToggle(
  checked: boolean,
  currentStyle: BasemapStyle,
  preferredStyle: BasemapStyle = DEFAULT_TILED_BASEMAP_STYLE
): BasemapStyle {
  if (!checked) {
    return BasemapStyle.BLANK_WHITE;
  }

  return currentStyle === BasemapStyle.BLANK_WHITE
    ? preferredStyle
    : currentStyle;
}
