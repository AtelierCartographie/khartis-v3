import { beforeEach, describe, expect, it, vi } from 'vitest';

const registerProcessorMock = vi.fn();

vi.mock('$lib/features/data-pipeline/processors/processor-registry', () => ({
  registerProcessor: registerProcessorMock
}));

vi.mock('$lib/features/data-pipeline/processors/strategies', () => ({
  csvProcessor: { id: 'csv' },
  geojsonProcessor: { id: 'geojson' },
  shapefileProcessor: { id: 'shp' },
  geopackageProcessor: { id: 'gpkg' },
  geoparquetProcessor: { id: 'gpq' }
}));

describe('registerAllProcessors', () => {
  beforeEach(() => {
    vi.resetModules();
    registerProcessorMock.mockReset();
  });

  it('registers all processors once', async () => {
    const { registerAllProcessors } =
      await import('$lib/features/data-pipeline/processors/register-processors');

    registerAllProcessors();

    expect(registerProcessorMock).toHaveBeenCalledTimes(5);
    expect(registerProcessorMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ id: 'csv' }),
      10
    );
    expect(registerProcessorMock).toHaveBeenNthCalledWith(
      5,
      expect.objectContaining({ id: 'gpq' }),
      10
    );
  });

  it('is idempotent', async () => {
    const { registerAllProcessors } =
      await import('$lib/features/data-pipeline/processors/register-processors');

    registerAllProcessors();
    registerAllProcessors();

    expect(registerProcessorMock).toHaveBeenCalledTimes(5);
  });
});
