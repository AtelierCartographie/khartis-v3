<script lang="ts">
  import ToggleTabs from '$lib/features/commons/components/toggle-tabs.svelte';
  import { GeoreferenceType } from '$lib/features/commons/constants/ui.constants';
  import {
    dataTabActions,
    dataTabState
  } from '$lib/features/commons/store/data-tab.store.svelte';
  import { datasetsStore } from '$lib/features/commons/store/datasets.store.svelte';
  import { GeoColumnDetector } from '$lib/features/commons/utils/geo-detector.utils';
  import { normalizeToProcessedDataset } from '$lib/features/data-pipeline/utils/processed-dataset.utils';
  import {
    Duck,
    duckDBOrchestrator,
    validateGPSColumns,
    type AnalysisResult,
    type GPSValidationResult
  } from '$lib/features/duckdb';
  import { GEOID_SCORE_THRESHOLD } from '$lib/features/commons/components/advanced-data-table/column-type-styles';
  import { basemapCatalogService } from '$lib/features/map/services/basemap-catalog.service.svelte';
  import * as m from '$lib/paraglide/messages';
  import { ComboBox, InlineNotification, Link } from 'carbon-components-svelte';
  import { Launch, Location, Map } from 'carbon-icons-svelte';
  import MainToolBarHeader from '../components/main-toolbar-header.svelte';
  import { dataTabStore } from './data-tab.store.svelte';
  import type { GeoComboBoxItem } from './data-tab.shared.types';

  const selectedDataset = $derived(datasetsStore.selectedDataset);
  const processedDataset = $derived.by(() =>
    selectedDataset ? normalizeToProcessedDataset(selectedDataset) : null
  );
  const geoDetection = $derived(selectedDataset?.geoDetection);

  let columnAnalysis = $state<AnalysisResult[]>([]);
  let columnAnalysisLoaded = $state(false);
  let previousAutoSelectedColumn = $state<string | null>(null);

  async function loadColumnAnalysis() {
    if (!selectedDataset?.tableName) {
      columnAnalysis = [];
      columnAnalysisLoaded = false;
      return;
    }
    try {
      columnAnalysis = await duckDBOrchestrator.getFullAnalysis(
        selectedDataset.tableName
      );
      columnAnalysisLoaded = true;
    } catch {
      columnAnalysis = [];
      columnAnalysisLoaded = false;
    }
  }

  const dataFieldItems = $derived(() => {
    if (!selectedDataset) return [];

    return selectedDataset.columns
      .filter((col) => col.name !== 'geometry' && col.name !== '__id')
      .map((col, index) => {
        const geoCol = geoDetection?.geoColumns.find(
          (gc) => gc.columnName === col.name
        );

        let displayText = col.name;
        if (geoCol) {
          const description = GeoColumnDetector.getGeoColumnDescription(geoCol);
          displayText = `${col.name} (${description})`;
        }

        return {
          id: index,
          text: displayText,
          columnName: col.name,
          isGeo: !!geoCol,
          confidence: geoCol?.confidence || 0
        };
      });
  });

  const bestGeoidColumn = $derived(() => {
    const geoidColumns = columnAnalysis
      .filter(
        (col) =>
          col.semioType === 'geoid' &&
          (col.semioScore ?? 0) >= GEOID_SCORE_THRESHOLD
      )
      .sort((a, b) => (b.semioScore ?? 0) - (a.semioScore ?? 0));

    if (geoidColumns.length > 0) {
      return dataFieldItems().find(
        (item) => item.columnName === geoidColumns[0].name
      );
    }
    return undefined;
  });

  const suggestedColumn = $derived(() => {
    const geoid = bestGeoidColumn();
    if (geoid) return geoid;

    const suggested = geoDetection?.suggestedPrimaryGeoColumn;
    if (!suggested) return undefined;

    return dataFieldItems().find(
      (item) => item.columnName === suggested.columnName
    );
  });

  const isGeoidSuggested = $derived(() => {
    const geoid = bestGeoidColumn();
    return geoid !== undefined && suggestedColumn() === geoid;
  });

  const latitudeColumns = $derived(() => {
    return dataFieldItems().filter((item) => {
      const geoCol = geoDetection?.geoColumns.find(
        (gc) => gc.columnName === item.columnName
      );
      return geoCol?.type === 'latitude';
    });
  });

  const longitudeColumns = $derived(() => {
    return dataFieldItems().filter((item) => {
      const geoCol = geoDetection?.geoColumns.find(
        (gc) => gc.columnName === item.columnName
      );
      return geoCol?.type === 'longitude';
    });
  });

  const geoFieldId = $derived(() => {
    const linkedVar = dataTabState.geolocation.linkedVariable;
    if (linkedVar !== undefined && linkedVar !== null) return linkedVar;

    if (suggestedColumn()) {
      return suggestedColumn()!.id;
    }

    return undefined;
  });

  let activeTabIndex = $state(
    dataTabState.geolocation.geoReference === GeoreferenceType.COORDINATES
      ? 1
      : 0
  );

  const GEO_LEARN_MORE_URL =
    'https://cartographie.sciencespo.fr/khartis/help/geocoding';

  const tabItems = [
    {
      icon: Map,
      label: m.geo_entities_tab(),
      iconSize: 20
    },
    {
      icon: Location,
      label: m.geo_coordinates_tab(),
      iconSize: 20
    }
  ];

  function handleTabChange(index: number) {
    activeTabIndex = index;
    dataTabActions.setGeolocationState({
      geoReference:
        index === 1 ? GeoreferenceType.COORDINATES : GeoreferenceType.ENTITIES
    });
  }

  let latitudeFieldId = $state<number | undefined>(undefined);
  let longitudeFieldId = $state<number | undefined>(undefined);
  let previousDatasetId = $state<string | undefined>(undefined);
  let gpsValidation = $state<GPSValidationResult | null>(null);

  $effect(() => {
    const currentDatasetId = selectedDataset?.id;
    if (currentDatasetId !== previousDatasetId) {
      previousDatasetId = currentDatasetId;
      latitudeFieldId = undefined;
      longitudeFieldId = undefined;
      activeTabIndex = 0;
      columnAnalysisLoaded = false;
      previousAutoSelectedColumn = null;
      dataTabActions.setGeolocationState({
        geoReference: GeoreferenceType.ENTITIES,
        linkedVariable: null,
        linkedVariableName: '',
        latitudeColumn: undefined,
        longitudeColumn: undefined
      });
    }
  });

  $effect(() => {
    const tableName = selectedDataset?.tableName;
    if (tableName) {
      loadColumnAnalysis();
    }
  });

  $effect(() => {
    if (latitudeColumns().length > 0 && latitudeFieldId === undefined) {
      const col = latitudeColumns()[0];
      latitudeFieldId = col.id;
      dataTabActions.setGeolocationState({
        latitudeColumn: col.columnName
      });
    }
  });

  $effect(() => {
    if (longitudeColumns().length > 0 && longitudeFieldId === undefined) {
      const col = longitudeColumns()[0];
      longitudeFieldId = col.id;
      dataTabActions.setGeolocationState({
        longitudeColumn: col.columnName
      });
    }
  });

  $effect(() => {
    if (geoDetection?.hasGeoColumns) {
      const hasLatLon =
        geoDetection.geoColumns.some((gc) => gc.type === 'latitude') &&
        geoDetection.geoColumns.some((gc) => gc.type === 'longitude');

      if (hasLatLon && activeTabIndex === 0) {
        activeTabIndex = 1;
        dataTabActions.setGeolocationState({
          geoReference: GeoreferenceType.COORDINATES
        });
      }
    }
  });

  async function autoSelectBasemap() {
    if (processedDataset && !dataTabState.basemapJoin.selectedBasemap) {
      const suggestions = await basemapCatalogService.getSuggestions(
        processedDataset,
        1
      );

      if (suggestions.length > 0 && suggestions[0].matchScore >= 40) {
        dataTabActions.selectBasemap(suggestions[0].file);
      }
    }
  }

  $effect(() => {
    const linkedVar = dataTabState.geolocation.linkedVariable;
    const linkedName = dataTabState.geolocation.linkedVariableName;
    const suggested = suggestedColumn();
    const geoid = bestGeoidColumn();

    if (linkedVar === null && !linkedName && suggested) {
      previousAutoSelectedColumn = suggested.columnName;
      dataTabActions.setGeolocationState({
        linkedVariable: suggested.id,
        linkedVariableName: suggested.columnName
      });
    } else if (
      columnAnalysisLoaded &&
      geoid &&
      previousAutoSelectedColumn &&
      linkedName === previousAutoSelectedColumn &&
      geoid.columnName !== previousAutoSelectedColumn
    ) {
      previousAutoSelectedColumn = geoid.columnName;
      dataTabActions.setGeolocationState({
        linkedVariable: geoid.id,
        linkedVariableName: geoid.columnName
      });
    }
  });

  $effect(() => {
    const linkedVar = dataTabState.geolocation.linkedVariable;
    if (linkedVar !== undefined && linkedVar !== null && selectedDataset) {
      autoSelectBasemap();
    }
  });

  $effect(() => {
    const geo = dataTabState.geolocation;
    const isEntityConfigured =
      geo.linkedVariable !== null && geo.linkedVariable !== undefined;
    const isCoordinatesConfigured =
      geo.geoReference === 'coordinates' &&
      geo.latitudeColumn &&
      geo.longitudeColumn;

    if (isEntityConfigured || isCoordinatesConfigured) {
      dataTabStore.markStepComplete(1);
    }
  });

  $effect(() => {
    const geo = dataTabState.geolocation;
    const tableName = selectedDataset?.tableName;

    if (
      activeTabIndex === 1 &&
      tableName &&
      geo.latitudeColumn &&
      geo.longitudeColumn &&
      Duck
    ) {
      validateGPSColumns(
        tableName,
        geo.latitudeColumn,
        geo.longitudeColumn,
        Duck
      ).then((result) => {
        gpsValidation = result;
      });
    } else {
      gpsValidation = null;
    }
  });
</script>

<section id="geolocation-step">
  <MainToolBarHeader title={m.geo_step_title()} />

  <p class="kh-help">
    {m.geo_step_description()}
  </p>

  <div class="tab-content">
    <div
      class="geo-controls-grid"
      class:coordinates-mode={activeTabIndex === 1}
    >
      <div class="form-field">
        <div class="field-label">{m.geo_reference()}</div>
        <div class="tab-container">
          <ToggleTabs
            activeIndex={activeTabIndex}
            items={tabItems}
            onChange={handleTabChange}
            className="geo-tabs"
          />
        </div>
      </div>

      <div class="form-field" class:hidden={activeTabIndex !== 0}>
        <div class="field-label">{m.geo_linked_variable()}</div>
        <ComboBox
          items={dataFieldItems()}
          selectedId={geoFieldId()}
          on:select={(e) =>
            dataTabActions.setGeolocationState({
              linkedVariable: e.detail.selectedId,
              linkedVariableName:
                (e.detail.selectedItem as GeoComboBoxItem)?.columnName || ''
            })}
          placeholder={m.geo_select_variable()}
        />
      </div>

      <div class="form-field" class:hidden={activeTabIndex !== 1}>
        <div class="field-label">{m.geo_longitude()}</div>
        <ComboBox
          items={longitudeColumns().length > 0
            ? longitudeColumns()
            : dataFieldItems()}
          selectedId={longitudeFieldId}
          on:select={(e) => {
            longitudeFieldId = e.detail.selectedId;
            dataTabActions.setGeolocationState({
              longitudeColumn: (e.detail.selectedItem as GeoComboBoxItem)
                ?.columnName
            });
          }}
          placeholder={m.geo_select_longitude()}
          labelText=""
        />
      </div>

      <div class="form-field" class:hidden={activeTabIndex !== 1}>
        <div class="field-label">{m.geo_latitude()}</div>
        <ComboBox
          items={latitudeColumns().length > 0
            ? latitudeColumns()
            : dataFieldItems()}
          selectedId={latitudeFieldId}
          on:select={(e) => {
            latitudeFieldId = e.detail.selectedId;
            dataTabActions.setGeolocationState({
              latitudeColumn: (e.detail.selectedItem as GeoComboBoxItem)
                ?.columnName
            });
          }}
          placeholder={m.geo_select_latitude()}
          labelText=""
        />
      </div>
    </div>

    {#if activeTabIndex === 0 && suggestedColumn()}
      {#if isGeoidSuggested()}
        <InlineNotification
          title={m.geo_geoid_detected_title()}
          subtitle={m.geo_geoid_detected_subtitle({
            column: suggestedColumn()!.columnName
          })}
          kind="success"
          lowContrast
          hideCloseButton={false}
        />
      {:else}
        <InlineNotification
          title={m.geo_column_detected_title()}
          subtitle={m.geo_column_detected_subtitle({
            column: suggestedColumn()!.columnName,
            confidence: Math.round(
              suggestedColumn()!.confidence * 100
            ).toString()
          })}
          kind="success"
          lowContrast
          hideCloseButton={false}
        />
      {/if}
    {/if}

    {#if activeTabIndex === 1 && latitudeColumns().length > 0 && longitudeColumns().length > 0}
      <InlineNotification
        title={m.geo_coords_detected_title()}
        subtitle={m.geo_coords_detected_subtitle()}
        kind="success"
        lowContrast
        hideCloseButton={false}
      />
    {/if}

    {#if activeTabIndex === 1 && gpsValidation?.warning}
      <InlineNotification
        title={gpsValidation.possibleInversion
          ? 'Inversion lat/lon détectée'
          : 'Attention'}
        subtitle={gpsValidation.warning}
        kind="warning"
        lowContrast
        hideCloseButton={false}
      />
    {/if}

    <Link href={GEO_LEARN_MORE_URL} target="_blank">
      {m.geo_learn_more_geocoding()}
      <Launch size={16} />
    </Link>
  </div>
</section>

<style>
  #geolocation-step {
    background-color: var(--cds-ui-02);
    padding: var(--cds-spacing-05);
  }

  .kh-help {
    color: var(--cds-text-02);
    margin-bottom: var(--cds-spacing-05);
    font-size: 0.875rem;
  }

  .tab-container {
    margin-bottom: var(--cds-spacing-06);
  }

  .tab-content {
    padding-top: var(--cds-spacing-05);
  }

  .form-field {
    margin-bottom: var(--cds-spacing-05);
  }

  .field-label {
    margin-bottom: var(--cds-spacing-03);
    font-size: 0.875rem;
    color: var(--cds-text-02);
    font-weight: 500;
  }

  .geo-controls-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--cds-spacing-05);
    align-items: start;
    margin-bottom: var(--cds-spacing-05);
  }

  .geo-controls-grid.coordinates-mode {
    grid-template-columns: 1fr 1fr 1fr;
  }

  .geo-controls-grid .form-field.hidden {
    display: none;
  }

  .tab-container {
    margin-bottom: 0;
  }

  :global(.geo-tabs) {
    width: 100%;
    max-width: none;
  }
</style>
