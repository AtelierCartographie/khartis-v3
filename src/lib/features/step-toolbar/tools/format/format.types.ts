import {
  FormatMode,
  Orientation,
  PageModel
} from '$lib/features/commons/constants/ui.constants';

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
  margins: {
    top: number;
    bottom: number;
    left: number;
    right: number;
  };
  gridEnabled: boolean;
  orientation?: Orientation;
}
