export interface FormatState {
  mode: 'preset' | 'custom';
  model: string;
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
  orientation?: 'landscape' | 'portrait';
}
