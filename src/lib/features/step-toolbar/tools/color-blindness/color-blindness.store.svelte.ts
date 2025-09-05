import {
  toolActions,
  toolState
} from '../tools-store/tools-store.store.svelte';
import type { ColorBlindnessState } from './color-blindness.types';

export function getColorBlindnessState(): ColorBlindnessState {
  return toolState.colorBlindness;
}

export const colorBlindnessActions = {
  setState(newState: Partial<ColorBlindnessState>): void {
    toolActions.updateColorBlindness(newState);
  },

  toggleEnabled(): void {
    const currentState = getColorBlindnessState();
    toolActions.updateColorBlindness({ enabled: !currentState.enabled });
    console.log(
      '[ColorBlindness] 👁️ Simulation',
      !currentState.enabled ? 'enabled' : 'disabled'
    );

    if (!currentState.enabled) {
      console.log(
        '[ColorBlindness] 🎨 Current simulation:',
        currentState.simulationType
      );
    }
  },

  setSimulationType(
    type:
      | 'none'
      | 'protanopia'
      | 'deuteranopia'
      | 'tritanopia'
      | 'protanomaly'
      | 'deuteranomaly'
      | 'tritanomaly'
      | 'achromatopsia'
      | 'achromatomaly'
  ): void {
    toolActions.updateColorBlindness({ simulationType: type });
    console.log('[ColorBlindness] 🎯 Simulation type changed to:', type);

    const currentState = getColorBlindnessState();
    if (currentState.enabled) {
      console.log('[ColorBlindness] 🔄 Applying', type, 'filter to map (mock)');
    }
  },

  testVisionTypes(): void {
    const types = ['protanopia', 'deuteranopia', 'tritanopia', 'achromatopsia'];
    console.log('[ColorBlindness] 🧪 Testing vision types:', types.join(', '));

    types.forEach((type, index) => {
      setTimeout(() => {
        console.log(
          `[ColorBlindness] 🔍 Test ${index + 1}: ${type} simulation`
        );
      }, index * 1000);
    });
  },

  reset(): void {
    console.log('[ColorBlindness] 🔄 Reset to default state');
    toolActions.resetTool('colorBlindness');
  }
};

export function isSimulationActive(): boolean {
  const currentState = getColorBlindnessState();
  return currentState.enabled && currentState.simulationType !== 'none';
}
