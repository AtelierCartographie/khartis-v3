import { SimplificationTarget } from '$lib/features/commons/constants/ui.constants';
import {
  SimplificationLevel,
  SimplificationSource
} from '$lib/features/commons/types/enums';
import { createToolStore } from '$lib/features/commons/utils/store.utils.svelte';
import type {
  SimplificationResult,
  SimplificationState
} from './simplification.types';

const DEFAULT_STATE: SimplificationState = {
  source: SimplificationSource.Basemap,
  level: SimplificationLevel.Medium,
  rate: 50,
  isProcessing: false
};

function getVertexReduction(level: SimplificationLevel): number {
  const reductions = {
    [SimplificationLevel.Low]: 25,
    [SimplificationLevel.Medium]: 50,
    [SimplificationLevel.High]: 75
  };
  return reductions[level];
}

type SimplificationActions = {
  setSource: (source: SimplificationSource) => void;
  setLevel: (level: SimplificationLevel) => void;
  setRate: (rate: number) => void;
  applySimplification: (
    geometryData?: unknown
  ) => Promise<SimplificationResult | null>;
  undoLastSimplification: () => boolean;
};

const { actions, getState } = createToolStore<
  SimplificationState,
  SimplificationActions
>(DEFAULT_STATE, (s) => {
  const performSimplification = (
    _geometryData?: unknown
  ): Promise<SimplificationResult> => {
    return new Promise((resolve) => {
      setTimeout(() => {
        if (s.source === SimplificationSource.Basemap) {
          const reduction = getVertexReduction(s.level);
          resolve({
            type: SimplificationTarget.BASEMAP,
            level: s.level,
            simplified: true,
            vertexReduction: reduction,
            originalVertices: 10000,
            simplifiedVertices: Math.round(10000 * (1 - reduction / 100))
          });
        } else {
          resolve({
            type: SimplificationTarget.GEODATA,
            rate: s.rate,
            simplified: true,
            vertexReduction: s.rate,
            originalVertices: 15000,
            simplifiedVertices: Math.round(15000 * (1 - s.rate / 100))
          });
        }
      }, 800);
    });
  };

  return {
    setSource: (source: SimplificationSource) => {
      s.source = source;
      if (source === SimplificationSource.Basemap && s.lastApplied) {
        s.level = s.lastApplied.level || SimplificationLevel.Medium;
      }
    },
    setLevel: (level: SimplificationLevel) => {
      if (s.source === SimplificationSource.Basemap) {
        s.level = level;
      }
    },
    setRate: (rate: number) => {
      if (s.source === SimplificationSource.Geo) {
        s.rate = Math.max(0, Math.min(100, rate));
      }
    },
    applySimplification: async (
      geometryData?: unknown
    ): Promise<SimplificationResult | null> => {
      if (s.isProcessing) {
        return null;
      }
      s.isProcessing = true;
      try {
        const result = await performSimplification(geometryData);
        s.lastApplied = {
          source: s.source,
          level:
            s.source === SimplificationSource.Basemap ? s.level : undefined,
          rate: s.source === SimplificationSource.Geo ? s.rate : undefined,
          timestamp: Date.now()
        };
        return result;
      } finally {
        s.isProcessing = false;
      }
    },
    undoLastSimplification: (): boolean => {
      if (s.lastApplied) {
        s.lastApplied = undefined;
        return true;
      }
      return false;
    }
  };
});

export const simplificationActions = actions;
export const getSimplificationState = getState;
