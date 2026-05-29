import { fireEvent, render, screen } from '@testing-library/svelte';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as m from '$lib/paraglide/messages';
import SearchTool from './search.svelte';

const mocks = vi.hoisted(() => ({
  searchState: {
    searchValue: 'sev',
    selectedSource: 'all',
    results: [
      { rowId: 1, columnName: 'city', value: 'Seville', score: 1 },
      { rowId: 2, columnName: 'region', value: 'Sevilla', score: 1 }
    ],
    currentResultIndex: 1,
    isSearching: false,
    caseSensitive: false,
    wholeWord: false,
    isSampled: false
  },
  searchActions: {
    setSearchValue: vi.fn(),
    setSelectedSource: vi.fn(),
    goToNextResult: vi.fn(),
    goToPreviousResult: vi.fn(),
    toggleCaseSensitive: vi.fn(),
    toggleWholeWord: vi.fn(),
    clearSearch: vi.fn()
  }
}));

vi.mock('$lib/features/commons/stores/datasets.store.svelte', () => ({
  datasetsStore: {
    get selectedDataset() {
      return {
        columns: [
          { name: 'city', type: 'text' },
          { name: 'region', type: 'text' },
          { name: 'basemap_id', type: 'text' },
          { name: 'basemap_label', type: 'text' },
          { name: 'typo_match', type: 'text' },
          { name: '__id', type: 'integer' },
          { name: 'geometry', type: 'geometry' }
        ]
      };
    },
    get enabledDatasets() {
      return [];
    },
    get datasets() {
      return [];
    }
  }
}));

vi.mock('$lib/features/commons/stores/visualization.store.svelte', () => ({
  visualizationStore: {
    get selectedVisualization() {
      return undefined;
    }
  }
}));

vi.mock('./search.store.svelte', () => ({
  searchState: mocks.searchState,
  searchActions: mocks.searchActions
}));

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

describe('visualization search tool', () => {
  beforeEach(() => {
    mocks.searchActions.clearSearch.mockClear();
    mocks.searchState.searchValue = 'sev';
    mocks.searchState.results = [
      { rowId: 1, columnName: 'city', value: 'Seville', score: 1 },
      { rowId: 2, columnName: 'region', value: 'Sevilla', score: 1 }
    ];
    mocks.searchState.currentResultIndex = 1;
  });

  it('shows the current result details without exposing a replace input', () => {
    render(SearchTool);

    expect(
      screen.getByText(m.search_results_count({ current: 2, total: 2 }))
    ).toBeInTheDocument();
    expect(screen.getByText('region')).toBeInTheDocument();
    expect(screen.getByText('Sevilla')).toBeInTheDocument();
    expect(
      screen.queryByText(m.search_replace_placeholder())
    ).not.toBeInTheDocument();
  });

  it('does not expose the regex option', () => {
    render(SearchTool);

    expect(
      screen.queryByLabelText(m.search_case_sensitive())
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(m.search_whole_word())).toBeInTheDocument();
    expect(screen.queryByText(/regex/i)).not.toBeInTheDocument();
  });

  it('does not expose internal id, geometry, or joined basemap columns in the source dropdown', async () => {
    render(SearchTool);

    await fireEvent.click(screen.getByRole('combobox'));

    expect(screen.getByRole('option', { name: 'city' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'region' })).toBeInTheDocument();
    expect(
      screen.queryByRole('option', { name: '__id' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('option', { name: 'geometry' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('option', { name: 'basemap_id' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('option', { name: 'basemap_label' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('option', { name: 'typo_match' })
    ).not.toBeInTheDocument();
  });
});
