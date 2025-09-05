import {
  SimplificationLevel,
  SimplificationSource
} from '$lib/features/commons/types/enums';
import type {
  SimplificationState,
  SimplificationResult
} from './simplification.types';

const DEFAULT_STATE: SimplificationState = {
  source: SimplificationSource.Basemap,
  level: SimplificationLevel.Medium,
  rate: 50,
  isProcessing: false
};

export const simplificationState = $state<SimplificationState>({
  ...DEFAULT_STATE
});

export const simplificationActions = {
  setState(newState: Partial<SimplificationState>): void {
    Object.assign(simplificationState, newState);
    console.log('[Simplification] 🔄 State updated:', newState);
  },

  setSource(source: SimplificationSource): void {
    simplificationState.source = source;
    console.log(
      '[Simplification] 📊 Source changed to:',
      source === SimplificationSource.Basemap ? 'Basemap' : 'Geo Data'
    );

    if (
      source === SimplificationSource.Basemap &&
      simplificationState.lastApplied
    ) {
      simplificationState.level =
        simplificationState.lastApplied.level || SimplificationLevel.Medium;
      console.log(
        '[Simplification] ↩️ Restored previous level:',
        simplificationState.level
      );
    }
  },

  setLevel(level: SimplificationLevel): void {
    if (simplificationState.source === SimplificationSource.Basemap) {
      simplificationState.level = level;
      const levelNames = {
        [SimplificationLevel.Low]: 'Faible',
        [SimplificationLevel.Medium]: 'Moyen',
        [SimplificationLevel.High]: 'Élevé'
      };
      console.log(
        '[Simplification] 📈 Level changed to:',
        levelNames[level],
        `(${getVertexReduction(level)}% reduction)`
      );
    } else {
      console.log('[Simplification] ⚠️ Cannot set level for Geo Data source');
    }
  },

  setRate(rate: number): void {
    if (simplificationState.source === SimplificationSource.Geo) {
      simplificationState.rate = Math.max(0, Math.min(100, rate));
      console.log(
        '[Simplification] 🎚️ Rate changed to:',
        simplificationState.rate + '%'
      );
    } else {
      console.log('[Simplification] ⚠️ Cannot set rate for Basemap source');
    }
  },

  async applySimplification(
    geometryData?: unknown
  ): Promise<SimplificationResult | null> {
    if (simplificationState.isProcessing) {
      console.log('[Simplification] ⚠️ Simplification already in progress');
      return null;
    }

    simplificationState.isProcessing = true;
    console.log('[Simplification] 🔄 Starting simplification process...');

    const sourceType =
      simplificationState.source === SimplificationSource.Basemap
        ? 'basemap'
        : 'geodata';
    console.log('[Simplification] 📊 Source:', sourceType);

    if (sourceType === 'basemap') {
      console.log('[Simplification] 📈 Level:', simplificationState.level);
      console.log(
        '[Simplification] 📉 Expected vertex reduction:',
        getVertexReduction(simplificationState.level) + '%'
      );
    } else {
      console.log('[Simplification] 🎚️ Rate:', simplificationState.rate + '%');
    }

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

      console.log('[Simplification] ✅ Simplification completed successfully');
      console.log('[Simplification] 📊 Result:', result);
      return result;
    } catch (error) {
      console.error('[Simplification] ❌ Simplification failed:', error);
      throw error;
    } finally {
      simplificationState.isProcessing = false;
    }
  },

  async performSimplification(
    geometryData?: unknown
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
      console.log('[Simplification] ↩️ Undoing last simplification');
      console.log(
        '[Simplification] 📅 Applied at:',
        new Date(simplificationState.lastApplied.timestamp).toLocaleTimeString()
      );
      simplificationState.lastApplied = undefined;
      return true;
    } else {
      console.log('[Simplification] ⚠️ No simplification to undo');
      return false;
    }
  },

  reset(): void {
    console.log('[Simplification] 🔄 Reset to default state');
    Object.assign(simplificationState, DEFAULT_STATE);
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
