import {
  FormatMode,
  Orientation,
  PageModel
} from '$lib/features/commons/constants/ui.constants';

/** Distances from the page edges, in page units. */
export interface PageInsets {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface FormatState {
  mode: FormatMode;
  model: PageModel;
  width: number;
  height: number;
  color: {
    hue: number;
    saturation: number;
    lightness: number;
  };
  /** Page layout area: grid, page texts and layout objects. */
  margins: PageInsets;
  /** Map frame, independent of the margins. */
  mapFrame: PageInsets;
  gridEnabled: boolean;
  orientation?: Orientation;
}
