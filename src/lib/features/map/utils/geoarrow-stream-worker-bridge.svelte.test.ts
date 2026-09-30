import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  Field,
  Float64,
  List,
  Table,
  makeTable,
  vectorFromArray
} from 'apache-arrow';
import type { Table as ArrowTable } from 'apache-arrow/Arrow';
import type { BinaryPathData } from '@ateliercartographie/geoarrow-deck-stream';

const mocks = vi.hoisted(() => ({
  bumpWorkerParseVersion: vi.fn(),
  getParseWorkerClient: vi.fn(),
  ipcBytesForTable: vi.fn(() => new Uint8Array([1, 2, 3])),
  trackWorkerParseVersion: vi.fn(() => 0),
  withParseWorkerTimeout: vi.fn(<T>(request: Promise<T>): Promise<T> => request)
}));

vi.mock('./worker-parse.svelte', () => mocks);

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolvePromise: ((value: T) => void) | undefined;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });

  return {
    promise,
    resolve(value: T) {
      resolvePromise?.(value);
    }
  };
}

function createSingleHeavyRowTable(): ArrowTable {
  const coordinates = Array.from({ length: 40_000 }, (_, index) => index);
  return new Table({
    geometry: vectorFromArray(
      [coordinates],
      new List(new Field('xy', new Float64()))
    )
  }) as ArrowTable;
}

function createManyLightRowsTable(): ArrowTable {
  return makeTable({
    geometry: Int32Array.from({ length: 5000 }, (_, index) => index)
  }) as ArrowTable;
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.ipcBytesForTable.mockReturnValue(new Uint8Array([1, 2, 3]));
  mocks.trackWorkerParseVersion.mockReturnValue(0);
  mocks.withParseWorkerTimeout.mockImplementation(
    <T>(request: Promise<T>): Promise<T> => request
  );
});

describe('GeoArrow stream worker bridge', () => {
  it('should fill the cache and bump the render version when parsing completes', async () => {
    const response = deferred<BinaryPathData>();
    const parseGeometry = vi.fn(() => response.promise);
    mocks.getParseWorkerClient.mockReturnValue({
      parseGeometry
    });
    const bridge = await import('./geoarrow-stream-bridge.utils');
    const table = createSingleHeavyRowTable();
    const parsed: BinaryPathData = {
      length: 1,
      positions: new Float32Array([2, 3]),
      startIndices: new Uint32Array([0, 1]),
      featureIds: new Uint32Array([0]),
      size: 2
    };

    const firstFrame = bridge.parsePaths(table);
    expect(firstFrame.length).toBe(0);

    response.resolve(parsed);
    await response.promise;
    await Promise.resolve();

    expect(mocks.bumpWorkerParseVersion).toHaveBeenCalledOnce();
    expect(bridge.parsePaths(table)).toBe(parsed);
    expect(parseGeometry).toHaveBeenCalledOnce();
    expect(mocks.withParseWorkerTimeout).toHaveBeenCalledWith(
      expect.any(Promise),
      'parseGeometry'
    );
  });

  it('should parse many light rows on the main thread', async () => {
    const parseGeometry = vi.fn();
    mocks.getParseWorkerClient.mockReturnValue({ parseGeometry });
    const bridge = await import('./geoarrow-stream-bridge.utils');

    expect(() => bridge.parsePaths(createManyLightRowsTable())).toThrow(
      /Unsupported geometry type/
    );
    expect(parseGeometry).not.toHaveBeenCalled();
  });

  it('should use the registered projection identity when requesting a worker parse', async () => {
    const response = deferred<BinaryPathData>();
    const parseGeometry = vi.fn(() => response.promise);
    mocks.getParseWorkerClient.mockReturnValue({
      parseGeometry
    });
    const bridge = await import('./geoarrow-stream-bridge.utils');
    const table = createSingleHeavyRowTable();

    bridge.parsePaths(table);

    expect(parseGeometry).toHaveBeenCalledWith(
      expect.any(Uint8Array),
      { projection: 'geoIdentity' },
      { capacityMultiplier: 1, rewind: false }
    );

    response.resolve({
      length: 0,
      positions: new Float32Array(0),
      startIndices: new Uint32Array([0]),
      featureIds: new Uint32Array(0),
      size: 2
    });
    await response.promise;
  });
});
