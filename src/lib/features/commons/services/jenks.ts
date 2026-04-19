// Above this count, sample input to bound O(N²·k) Jenks on WASM main thread.
const MAX_VALUES = 1000;

export function computeJenksBreaks(
  values: readonly number[],
  numClasses: number
): number[] {
  if (numClasses < 2) return [];
  const sample = sampleSorted(values);
  if (sample.length === 0) return [];
  if (sample.length <= numClasses) return [];
  if (sample[0] === sample[sample.length - 1]) return [];

  const n = sample.length;
  const k = numClasses;

  const lowerClassLimits: Uint32Array[] = Array.from(
    { length: n + 1 },
    () => new Uint32Array(k + 1)
  );
  const varianceCombinations: Float64Array[] = Array.from(
    { length: n + 1 },
    () => new Float64Array(k + 1)
  );

  for (let i = 1; i <= k; i++) {
    lowerClassLimits[1][i] = 1;
    for (let j = 2; j <= n; j++) {
      varianceCombinations[j][i] = Number.POSITIVE_INFINITY;
    }
  }

  for (let l = 2; l <= n; l++) {
    let sum = 0;
    let sumSquares = 0;
    let w = 0;
    for (let m = 1; m <= l; m++) {
      const lowerClassLimit = l - m + 1;
      const value = sample[lowerClassLimit - 1];
      w += 1;
      sum += value;
      sumSquares += value * value;
      const variance = sumSquares - (sum * sum) / w;
      const i4 = lowerClassLimit - 1;
      if (i4 === 0) continue;
      for (let j = 2; j <= k; j++) {
        const candidate = variance + varianceCombinations[i4][j - 1];
        if (varianceCombinations[l][j] >= candidate) {
          lowerClassLimits[l][j] = lowerClassLimit;
          varianceCombinations[l][j] = candidate;
        }
      }
    }
    lowerClassLimits[l][1] = 1;
    varianceCombinations[l][1] = sumSquares - (sum * sum) / w;
  }

  // Backtrack: collect upper bound of each class except the last (which is max).
  // Convention follows simple-statistics: kclass[i] = sample[LCL[cursor][i+1] - 2]
  const kclass = new Array<number>(k + 1);
  kclass[0] = sample[0];
  kclass[k] = sample[n - 1];
  let cursor = n;
  for (let countNum = k; countNum > 1; countNum--) {
    const boundary = lowerClassLimits[cursor][countNum];
    if (boundary <= 1) break;
    kclass[countNum - 1] = sample[boundary - 2];
    cursor = boundary - 1;
  }

  return dedupeAscending(kclass.slice(1, -1));
}

function sampleSorted(values: readonly number[]): number[] {
  const cleaned: number[] = [];
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      cleaned.push(value);
    }
  }
  if (cleaned.length === 0) return cleaned;
  cleaned.sort((a, b) => a - b);
  if (cleaned.length <= MAX_VALUES) return cleaned;

  const step = (cleaned.length - 1) / (MAX_VALUES - 1);
  const out: number[] = new Array(MAX_VALUES);
  for (let i = 0; i < MAX_VALUES; i++) {
    const idx = Math.round(i * step);
    out[i] = cleaned[Math.min(idx, cleaned.length - 1)];
  }
  return out;
}

function dedupeAscending(values: number[]): number[] {
  const out: number[] = [];
  for (const value of values) {
    if (out.length === 0 || value > out[out.length - 1]) {
      out.push(value);
    }
  }
  return out;
}
