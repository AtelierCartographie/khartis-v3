import { ColorBlindnessType } from '$lib/features/commons/constants/ui.constants';

export interface ColorBlindnessState {
  simulationType: ColorBlindnessType;
  enabled: boolean;
}
