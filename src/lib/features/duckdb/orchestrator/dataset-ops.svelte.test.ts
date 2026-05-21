import { describe, expect, it, vi } from 'vitest';
import type { DuckDBClientForDataset } from './dataset-ops';

vi.mock('$lib/features/data-pipeline', () => ({
  generateTableName: vi.fn()
}));

vi.mock('$lib/features/data-pipeline/processors/processor-registry', () => ({
  getProcessor: vi.fn(),
  hasProcessor: vi.fn()
}));

vi.mock('$lib/features/data-pipeline/processors/register-processors', () => ({
  registerAllProcessors: vi.fn()
}));

const { dropTable } = await import('./dataset-ops');

describe('dataset-ops', () => {
  it('escapes table names as SQL identifiers when dropping a table', async () => {
    const query = vi.fn().mockResolvedValue([]);
    const duck = { query } as unknown as DuckDBClientForDataset;

    await dropTable('imported"table', duck);

    expect(query).toHaveBeenCalledWith(
      'DROP TABLE IF EXISTS "imported""table"'
    );
  });
});
