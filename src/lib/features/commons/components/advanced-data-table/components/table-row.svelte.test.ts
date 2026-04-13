import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import TableRow from './table-row.svelte';

describe('table-row', () => {
  const baseProps = {
    row: {
      __id: 7,
      code: 'FRA',
      name: 'France'
    },
    rowIndex: 6,
    visibleColumns: [
      { name: 'code', type: 'TEXT' },
      { name: 'name', type: 'TEXT' }
    ]
  };

  it('shows the row number when selection mode is disabled', () => {
    render(TableRow, {
      ...baseProps,
      isSelectable: false,
      showRowNumbers: true
    });

    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('replaces the row number with a checkbox in selection mode', () => {
    render(TableRow, {
      ...baseProps,
      isSelectable: true,
      showRowNumbers: false
    });

    expect(screen.getByRole('checkbox')).toBeInTheDocument();
    expect(screen.queryByText('7')).not.toBeInTheDocument();
  });
});
