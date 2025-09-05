import {
  SimplificationLevel,
  SimplificationSource
} from '$lib/features/commons/types/enums';
import { toolActions, toolState } from '../tools-store/tools.store.svelte';
import type {
  SimplificationState,
  SimplificationResult
} from './simplification.types';

export function getSimplificationState(): SimplificationState {
  return toolState.simplification;
}

export const simplificationActions = {
  setState(newState: Partial<SimplificationState>): void {
    toolActions.updateSimplification(newState);
  },

  setSource(source: SimplificationSource): void {
    const state = getSimplificationState();
    const updates: Partial<SimplificationState> = { source };
    
    if (source === SimplificationSource.Basemap && state.lastApplied) {
      updates.level = state.lastApplied.level || SimplificationLevel.Medium;
    }
    
    toolActions.updateSimplification(updates);
  },

  setLevel(level: SimplificationLevel): void {
    const state = getSimplificationState();
    if (state.source === SimplificationSource.Basemap) {
      toolActions.updateSimplification({ level });
    }
  },

  setRate(rate: number): void {
    const state = getSimplificationState();
    if (state.source === SimplificationSource.Geo) {
      toolActions.updateSimplification({ rate: Math.max(0, Math.min(100, rate)) });
    }
  },

  async applySimplification(
    geometryData?: unknown
  ): Promise<SimplificationResult | null> {
    const state = getSimplificationState();
    if (state.isProcessing) {
      return null;
    }

    toolActions.updateSimplification({ isProcessing: true });

    const sourceType =
      state.source === SimplificationSource.Basemap
        ? 'basemap'
        : 'geodata';

    try {
      const result = await this.performSimplification(geometryData);

      const currentState = getSimplificationState();
      toolActions.updateSimplification({
        lastApplied: {
          source: currentState.source,
          level:
            currentState.source === SimplificationSource.Basemap
              ? currentState.level
              : undefined,
          rate:
            currentState.source === SimplificationSource.Geo
              ? currentState.rate
              : undefined,
          timestamp: Date.now()
        }
      });

      console.log('[Simplification] ✅ Simplification completed successfully');
      console.log('[Simplification] 📊 Result:', result);
      return result;
    } catch (error) {
      console.error('[Simplification] ❌ Simplification failed:', error);
      throw error;
    } finally {
      toolActions.updateSimplification({ isProcessing: false });
    }
  },

  async performSimplification(
    geometryData?: unknown
  ): Promise<SimplificationResult> {
    const state = getSimplificationState();
    return new Promise((resolve) => {
      setTimeout(() => {
        if (state.source === SimplificationSource.Basemap) {
          const reduction = getVertexReduction(state.level);
          resolve({
            type: 'basemap',
            level: state.level,
            simplified: true,
            vertexReduction: reduction,
            originalVertices: 10000,
            simplifiedVertices: Math.round(10000 * (1 - reduction / 100))
          });
        } else {
          resolve({
            type: 'geodata',
            rate: state.rate,
            simplified: true,
            vertexReduction: state.rate,
            originalVertices: 15000,
            simplifiedVertices: Math.round(
              15000 * (1 - state.rate / 100)
            )
          });
        }
      }, 800);
    });
  },

  undoLastSimplification(): boolean {
    const state = getSimplificationState();
    if (state.lastApplied) {
      toolActions.updateSimplification({ lastApplied: undefined });
      return true;
    } else {
      return false;
    }
  },

  reset(): void {
    toolActions.updateSimplification({
      source: SimplificationSource.Basemap,
      level: SimplificationLevel.Medium,
      rate: 50,
      isProcessing: false,
      lastApplied: undefined
    });
  }
};

export function getVertexReduction(level: SimplificationLevel): number {
  const reductions = {
    [SimplificationLevel.Low]: 25,
    [SimplificationLevel.Medium]: 50,
    [SimplificationLevel.High]: 75
  };
  return reductions[level];
}

export function getSimplificationTolerance(): number {
  const state = getSimplificationState();
  if (state.source === SimplificationSource.Basemap) {
    const tolerances = {
      [SimplificationLevel.Low]: 0.001,
      [SimplificationLevel.Medium]: 0.005,
      [SimplificationLevel.High]: 0.01
    };
    return tolerances[state.level];
  } else {
    return (100 - state.rate) / 10000;
  }
}

export function canUndo(): boolean {
  const state = getSimplificationState();
  return !!state.lastApplied;
}
