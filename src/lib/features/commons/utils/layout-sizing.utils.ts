import { PageModel } from '$lib/features/commons/constants/ui.constants';

export const LAYOUT_SIZING_PROFILES = [
  'print-standard',
  'print-large',
  'screen-large'
] as const;

export type LayoutSizingProfile = (typeof LAYOUT_SIZING_PROFILES)[number];

export interface LayoutSizingContext {
  width: number;
  height: number;
  model?: string | null;
}

export interface LayoutSizingTokens {
  profile: LayoutSizingProfile;
  mapViewport: {
    fitPaddingPx: number;
  };
  legend: {
    fontSize: number;
    maxWidth: number;
    paddingInline: number;
    paddingBlock: number;
    swatchSize: number;
    patternedSwatchSize: number;
  };
  annotations: {
    noteFontSize: number;
    titleFontSize: number;
    subtitleFontSize: number;
    captionFontSize: number;
    textMaxWidth: number;
    textPaddingInline: number;
    textPaddingBlock: number;
    defaultTextWidth: number;
    defaultTextHeight: number;
    titleWidth: number;
    subtitleWidth: number;
    captionWidth: number;
    noteWidth: number;
    imageSize: number;
    drawingWidth: number;
    drawingHeight: number;
    shapeScale: number;
  };
  geoIndications: {
    scaleFontSize: number;
    scaleTargetWidth: number;
    scalePanelPaddingInline: number;
    scalePanelPaddingBlock: number;
    panelPadding: number;
    orientationSizeMm: number;
    insetSize: number;
  };
}

const TOKENS_BY_PROFILE = {
  'print-standard': {
    mapViewport: {
      fitPaddingPx: 40
    },
    legend: {
      fontSize: 10,
      maxWidth: 160,
      paddingInline: 16,
      paddingBlock: 12,
      swatchSize: 16,
      patternedSwatchSize: 20
    },
    annotations: {
      noteFontSize: 9,
      titleFontSize: 14,
      subtitleFontSize: 11,
      captionFontSize: 8,
      textMaxWidth: 300,
      textPaddingInline: 12,
      textPaddingBlock: 8,
      defaultTextWidth: 220,
      defaultTextHeight: 36,
      titleWidth: 320,
      subtitleWidth: 320,
      captionWidth: 220,
      noteWidth: 220,
      imageSize: 120,
      drawingWidth: 132,
      drawingHeight: 80,
      shapeScale: 1
    },
    geoIndications: {
      scaleFontSize: 9,
      scaleTargetWidth: 80,
      scalePanelPaddingInline: 6,
      scalePanelPaddingBlock: 4,
      panelPadding: 6,
      orientationSizeMm: 10,
      insetSize: 100
    }
  },
  'print-large': {
    mapViewport: {
      fitPaddingPx: 56
    },
    legend: {
      fontSize: 11,
      maxWidth: 200,
      paddingInline: 18,
      paddingBlock: 14,
      swatchSize: 18,
      patternedSwatchSize: 22
    },
    annotations: {
      noteFontSize: 10,
      titleFontSize: 16,
      subtitleFontSize: 13,
      captionFontSize: 9,
      textMaxWidth: 360,
      textPaddingInline: 14,
      textPaddingBlock: 10,
      defaultTextWidth: 260,
      defaultTextHeight: 48,
      titleWidth: 380,
      subtitleWidth: 380,
      captionWidth: 260,
      noteWidth: 260,
      imageSize: 160,
      drawingWidth: 160,
      drawingHeight: 96,
      shapeScale: 1.15
    },
    geoIndications: {
      scaleFontSize: 10,
      scaleTargetWidth: 100,
      scalePanelPaddingInline: 8,
      scalePanelPaddingBlock: 6,
      panelPadding: 8,
      orientationSizeMm: 12,
      insetSize: 130
    }
  },
  'screen-large': {
    mapViewport: {
      fitPaddingPx: 72
    },
    legend: {
      fontSize: 12,
      maxWidth: 260,
      paddingInline: 20,
      paddingBlock: 16,
      swatchSize: 20,
      patternedSwatchSize: 24
    },
    annotations: {
      noteFontSize: 11,
      titleFontSize: 20,
      subtitleFontSize: 14,
      captionFontSize: 10,
      textMaxWidth: 420,
      textPaddingInline: 16,
      textPaddingBlock: 12,
      defaultTextWidth: 300,
      defaultTextHeight: 48,
      titleWidth: 440,
      subtitleWidth: 440,
      captionWidth: 300,
      noteWidth: 300,
      imageSize: 200,
      drawingWidth: 184,
      drawingHeight: 112,
      shapeScale: 1.25
    },
    geoIndications: {
      scaleFontSize: 11,
      scaleTargetWidth: 120,
      scalePanelPaddingInline: 10,
      scalePanelPaddingBlock: 8,
      panelPadding: 10,
      orientationSizeMm: 12,
      insetSize: 160
    }
  }
} satisfies Record<LayoutSizingProfile, Omit<LayoutSizingTokens, 'profile'>>;

export const PRINT_STANDARD_TOKENS = TOKENS_BY_PROFILE['print-standard'];

function isScreenPageModel(model?: string | null): boolean {
  return (
    model === PageModel.SCREEN_LANDSCAPE || model === PageModel.SCREEN_PORTRAIT
  );
}

export function resolveLayoutSizingProfile({
  width,
  height,
  model
}: LayoutSizingContext): LayoutSizingProfile {
  if (isScreenPageModel(model)) {
    return 'screen-large';
  }

  const shortSide = Math.min(width, height);

  if (shortSide >= 900) {
    return 'screen-large';
  }

  if (shortSide >= 700) {
    return 'print-large';
  }

  return 'print-standard';
}

export function resolveLayoutSizingTokens(
  context: LayoutSizingContext
): LayoutSizingTokens {
  const profile = resolveLayoutSizingProfile(context);

  return {
    profile,
    ...TOKENS_BY_PROFILE[profile]
  };
}
