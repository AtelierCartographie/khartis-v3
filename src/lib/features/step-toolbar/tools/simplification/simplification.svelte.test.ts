import { render, screen, fireEvent } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as m from '$lib/paraglide/messages';
import {
  SimplificationLevel,
  SimplificationSource
} from '$lib/features/commons/types/enums';

type SimplLevelValue = 'low' | 'medium' | 'high';
type SimplSourceValue = 'basemap' | 'geo';
type SimplStateMock = {
  source: SimplSourceValue;
  level: SimplLevelValue;
  rate: number;
  isProcessing: boolean;
  lastApplied?: {
    source: SimplSourceValue;
    level?: SimplLevelValue;
    rate?: number;
    timestamp: number;
  };
};
type GeoDatasetMock = {
  id: string;
  name: string;
  geometry?: unknown;
  joinedBasemap?: string;
};

const mocks = vi.hoisted(() => ({
  simplState: {
    source: 'basemap',
    level: 'medium',
    rate: 50,
    isProcessing: false,
    lastApplied: undefined
  } as SimplStateMock,
  simplActions: {
    setSource: vi.fn(),
    setLevel: vi.fn(),
    setRate: vi.fn(),
    applySimplification: vi.fn().mockResolvedValue(null),
    undoLastSimplification: vi.fn().mockResolvedValue(true)
  },
  availableLevels: [] as SimplLevelValue[],
  preferredLevel: null as SimplLevelValue | null,
  currentBasemap: null as unknown,
  currentMetadata: null as unknown,
  availableBasemaps: [] as unknown[],
  osmIsActive: false,
  requiresMapLibre: false,
  selectedDataset: null as unknown,
  geoDatasets: [] as GeoDatasetMock[]
}));

vi.mock('./simplification.store.svelte', () => ({
  simplificationActions: mocks.simplActions,
  getSimplificationState: () => mocks.simplState
}));

vi.mock('$lib/features/map/services/basemap.service.svelte', () => ({
  basemapService: {
    get currentBasemap() {
      return mocks.currentBasemap;
    },
    get currentMetadata() {
      return mocks.currentMetadata;
    },
    get availableBasemaps() {
      return mocks.availableBasemaps;
    }
  },
  getAvailableBasemapSimplificationLevels: () => mocks.availableLevels,
  getPreferredBasemapSimplificationLevel: () => mocks.preferredLevel
}));

vi.mock('$lib/features/map/stores/osm-basemap.store.svelte', () => ({
  osmBasemapStore: {
    get isActive() {
      return mocks.osmIsActive;
    }
  }
}));

vi.mock('$lib/features/commons/store/basemap-style.store.svelte', () => ({
  basemapStyleStore: {
    get requiresMapLibre() {
      return mocks.requiresMapLibre;
    }
  }
}));

vi.mock('$lib/features/commons/store/datasets.store.svelte', () => ({
  datasetsStore: {
    get selectedDataset() {
      return mocks.selectedDataset;
    },
    get datasets() {
      return mocks.geoDatasets;
    },
    getDatasetsByType: () => mocks.geoDatasets
  }
}));

const SimplificationTool = (await import('./simplification.svelte')).default;

function resetMocks() {
  vi.clearAllMocks();
  mocks.simplState.source = SimplificationSource.Basemap as SimplSourceValue;
  mocks.simplState.level = SimplificationLevel.Medium as SimplLevelValue;
  mocks.simplState.rate = 50;
  mocks.simplState.isProcessing = false;
  mocks.simplState.lastApplied = undefined;
  mocks.availableLevels = [];
  mocks.preferredLevel = null;
  mocks.currentBasemap = null;
  mocks.currentMetadata = null;
  mocks.availableBasemaps = [];
  mocks.osmIsActive = false;
  mocks.requiresMapLibre = false;
  mocks.selectedDataset = null;
  mocks.geoDatasets = [];
}

describe('simplification tool — OSM reference basemap', () => {
  beforeEach(resetMocks);

  it('should display OSM blocking notification when the tiled reference basemap is active', () => {
    mocks.osmIsActive = true;

    render(SimplificationTool);

    expect(
      screen.getByText(m.simplification_osm_not_available())
    ).toBeInTheDocument();
    expect(
      screen.getByText(m.simplification_osm_explanation())
    ).toBeInTheDocument();
  });

  it('should also block simplification when only a MapLibre tiled style is selected (no OSM join yet)', () => {
    // basemapStyleStore.requiresMapLibre is true as soon as a non-blank style
    // is picked in the visualization tab, even before a tiled dataset is joined.
    mocks.requiresMapLibre = true;

    render(SimplificationTool);

    expect(
      screen.getByText(m.simplification_osm_not_available())
    ).toBeInTheDocument();
  });
});

describe('simplification tool — catalog basemap', () => {
  beforeEach(resetMocks);

  it('should show the 3 predefined levels (Faible, Moyen, Élevé) when variants are available', () => {
    mocks.currentMetadata = {
      file: 'europe-medium',
      simplification_level: 'medium'
    };
    mocks.availableLevels = [
      SimplificationLevel.Low as SimplLevelValue,
      SimplificationLevel.Medium as SimplLevelValue,
      SimplificationLevel.High as SimplLevelValue
    ];
    mocks.preferredLevel = SimplificationLevel.Medium as SimplLevelValue;

    render(SimplificationTool);

    expect(
      screen.getByText(m.simplification_level_label())
    ).toBeInTheDocument();
    expect(screen.getByText(m.simplification_level_low())).toBeInTheDocument();
    expect(
      screen.getByText(m.simplification_level_medium())
    ).toBeInTheDocument();
    expect(screen.getByText(m.simplification_level_high())).toBeInTheDocument();
  });

  it('should show the no-variants info notification when the catalog basemap has no alternative level', () => {
    mocks.currentMetadata = {
      file: 'world-countries',
      simplification_level: 'medium'
    };
    mocks.availableLevels = [];
    mocks.preferredLevel = null;

    render(SimplificationTool);

    expect(
      screen.getByText(m.simplification_no_variants())
    ).toBeInTheDocument();
  });
});

describe('simplification tool — imported basemap', () => {
  beforeEach(resetMocks);

  it('should display the entity-removal warning and a rate slider for imported basemaps', () => {
    mocks.currentBasemap = { metadata: { isCustom: true } };
    mocks.currentMetadata = { file: 'custom-map' };
    mocks.availableLevels = [];

    render(SimplificationTool);

    expect(
      screen.getByText(m.simplification_warning_title())
    ).toBeInTheDocument();
    expect(
      screen.getByText(m.simplification_warning_subtitle())
    ).toBeInTheDocument();
    expect(screen.getByText(m.simplification_rate_label())).toBeInTheDocument();
  });
});

describe('simplification tool — geo datasets', () => {
  beforeEach(resetMocks);

  it('should show the rate slider and warning, without a dropdown when only one geo dataset exists', () => {
    mocks.simplState.source = SimplificationSource.Geo as SimplSourceValue;
    mocks.geoDatasets = [
      {
        id: 'ds-1',
        name: 'regions.geojson',
        geometry: { bounds: [0, 0, 1, 1] }
      }
    ];
    mocks.selectedDataset = mocks.geoDatasets[0];

    render(SimplificationTool);

    expect(
      screen.getByText(m.simplification_warning_title())
    ).toBeInTheDocument();
    expect(screen.getByText(m.simplification_rate_label())).toBeInTheDocument();
    expect(
      screen.queryByText(m.simplification_geo_dataset_label())
    ).not.toBeInTheDocument();
  });

  it('should expose a dataset dropdown when several geo datasets are available', () => {
    mocks.simplState.source = SimplificationSource.Geo as SimplSourceValue;
    mocks.geoDatasets = [
      {
        id: 'ds-1',
        name: 'regions.geojson',
        geometry: { bounds: [0, 0, 1, 1] }
      },
      {
        id: 'ds-2',
        name: 'communes.geojson',
        geometry: { bounds: [0, 0, 1, 1] }
      }
    ];
    mocks.selectedDataset = mocks.geoDatasets[0];

    const { container } = render(SimplificationTool);

    expect(container.querySelector('.bx--dropdown')).not.toBeNull();
  });
});

describe('simplification tool — undo button', () => {
  beforeEach(resetMocks);

  it('should not render the undo button when nothing has been applied', () => {
    render(SimplificationTool);

    expect(
      screen.queryByRole('button', { name: m.projection_code_reset() })
    ).not.toBeInTheDocument();
  });

  it('should render the undo button and trigger the store action when clicked after a simplification was applied', async () => {
    mocks.simplState.lastApplied = {
      source: SimplificationSource.Geo as SimplSourceValue,
      rate: 50,
      timestamp: Date.now()
    };
    mocks.geoDatasets = [
      {
        id: 'ds-1',
        name: 'regions.geojson',
        geometry: { bounds: [0, 0, 1, 1] }
      }
    ];
    mocks.selectedDataset = mocks.geoDatasets[0];
    mocks.simplState.source = SimplificationSource.Geo as SimplSourceValue;

    render(SimplificationTool);

    const undoButton = screen.getByRole('button', {
      name: m.projection_code_reset()
    });
    expect(undoButton).toBeInTheDocument();

    await fireEvent.click(undoButton);

    expect(mocks.simplActions.undoLastSimplification).toHaveBeenCalledTimes(1);
  });
});
