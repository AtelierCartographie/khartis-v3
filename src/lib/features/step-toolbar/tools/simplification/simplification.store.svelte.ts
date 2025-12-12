import {
  SimplificationLevel,
  SimplificationSource
} from '$lib/features/commons/types/enums';
import { createResetFunction } from '$lib/features/commons/utils/store.utils';
import type {
  SimplificationResult,
  SimplificationState
} from './simplification.types';

const DEFAULT_SIMPLIFICATION_STATE: SimplificationState = {
  source: SimplificationSource.Basemap,
  level: SimplificationLevel.Medium,
  rate: 50,
  isProcessing: false
};

export const simplificationState = $state<SimplificationState>({
  ...DEFAULT_SIMPLIFICATION_STATE
});

export function getSimplificationState(): SimplificationState {
  return simplificationState;
}

export const simplificationActions = {
  setState(newState: Partial<SimplificationState>): void {
    Object.assign(simplificationState, newState);
  },

  setSource(source: SimplificationSource): void {
    simplificationState.source = source;

    if (
      source === SimplificationSource.Basemap &&
      simplificationState.lastApplied
    ) {
      simplificationState.level =
        simplificationState.lastApplied.level || SimplificationLevel.Medium;
    }
  },

  setLevel(level: SimplificationLevel): void {
    if (simplificationState.source === SimplificationSource.Basemap) {
      simplificationState.level = level;
    }
  },

  setRate(rate: number): void {
    if (simplificationState.source === SimplificationSource.Geo) {
      simplificationState.rate = Math.max(0, Math.min(100, rate));
    }
  },

  async applySimplification(
    geometryData?: unknown
  ): Promise<SimplificationResult | null> {
    if (simplificationState.isProcessing) {
      return null;
    }

    simplificationState.isProcessing = true;

    try {
      const result = await this.performSimplification(geometryData);

      simplificationState.lastApplied = {
        source: simplificationState.source,
        level:
          simplificationState.source === SimplificationSource.Basemap
            ? simplificationState.level
            : undefined,
        rate:
          simplificationState.source === SimplificationSource.Geo
            ? simplificationState.rate
            : undefined,
        timestamp: Date.now()
      };

      return result;
    } finally {
      simplificationState.isProcessing = false;
    }
  },

  async performSimplification(
    _geometryData?: unknown
  ): Promise<SimplificationResult> {
    return new Promise((resolve) => {
      setTimeout(() => {
        if (simplificationState.source === SimplificationSource.Basemap) {
          const reduction = getVertexReduction(simplificationState.level);
          resolve({
            type: 'basemap',
            level: simplificationState.level,
            simplified: true,
            vertexReduction: reduction,
            originalVertices: 10000,
            simplifiedVertices: Math.round(10000 * (1 - reduction / 100))
          });
        } else {
          resolve({
            type: 'geodata',
            rate: simplificationState.rate,
            simplified: true,
            vertexReduction: simplificationState.rate,
            originalVertices: 15000,
            simplifiedVertices: Math.round(
              15000 * (1 - simplificationState.rate / 100)
            )
          });
        }
      }, 800);
    });
  },

  undoLastSimplification(): boolean {
    if (simplificationState.lastApplied) {
      simplificationState.lastApplied = undefined;
      return true;
    } else {
      return false;
    }
  },

  reset: createResetFunction(simplificationState, DEFAULT_SIMPLIFICATION_STATE)
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
  if (simplificationState.source === SimplificationSource.Basemap) {
    const tolerances = {
      [SimplificationLevel.Low]: 0.001,
      [SimplificationLevel.Medium]: 0.005,
      [SimplificationLevel.High]: 0.01
    };
    return tolerances[simplificationState.level];
  } else {
    return (100 - simplificationState.rate) / 10000;
  }
}

export function canUndo(): boolean {
  return !!simplificationState.lastApplied;
}
