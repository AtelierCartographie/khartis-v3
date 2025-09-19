export interface ColorBlindnessState {
  simulationType:
    | 'none'
    | 'protanopia'
    | 'deuteranopia'
    | 'tritanopia'
    | 'protanomaly'
    | 'deuteranomaly'
    | 'tritanomaly'
    | 'achromatopsia'
    | 'achromatomaly';
  enabled: boolean;
}
