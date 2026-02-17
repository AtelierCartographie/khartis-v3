<script lang="ts">
  import { GEOID_SCORE_THRESHOLD } from '$lib/features/commons/components/advanced-data-table/column-type-styles';
  import ToggleTabs from '$lib/features/commons/components/toggle-tabs.svelte';
  import VariableBadge from '$lib/features/commons/components/variable-badge.svelte';
  import type { VariableBadgeType } from '$lib/features/commons/components/variable-badge.types';
  import { GeoreferenceType } from '$lib/features/commons/constants/ui.constants';
  import { INTERNAL_COLUMN } from '$lib/features/commons/constants/data.constants';
  import {
    dataTabActions,
    dataTabState
  } from '$lib/features/commons/store/data-tab.store.svelte';
  import { datasetsStore } from '$lib/features/commons/store/datasets.store.svelte';
  import { globalState } from '$lib/features/commons/store/global.svelte';
  import { ToolbarState } from '$lib/features/commons/types/global';
  import { GeoColumnDetector } from '$lib/features/commons/utils/geo-detector.utils';
  import { normalizeToProcessedDataset } from '$lib/features/data-pipeline/utils/processed-dataset.utils';
  import {
    Duck,
    duckDBOrchestrator,
    validateGPSColumns,
    type AnalysisResult,
    type GPSValidationResult
  } from '$lib/features/duckdb';
  import { basemapCatalogService } from '$lib/features/map/services/basemap-catalog.service.svelte';
  import * as m from '$lib/paraglide/messages';
  import { ComboBox, InlineNotification, Link } from 'carbon-components-svelte';
  import { Launch, Location, Map as MapIcon } from 'carbon-icons-svelte';
  import { InfoPopover } from '../visualization-tab/components/shared';
  import MainToolBarHeader from '../components/main-toolbar-header.svelte';
  import type { GeoComboBoxItem } from './data-tab.shared.types';
  import { dataTabStore } from './data-tab.store.svelte';

  const isCompact = $derived(globalState.toolbarState === ToolbarState.Compact);
  const selectedDataset = $derived(datasetsStore.selectedDataset);
  const duckDBDatasetsVersion = $derived(duckDBOrchestrator.datasetsVersion);
  const processedDataset = $derived.by(() =>
    selectedDataset ? normalizeToProcessedDataset(selectedDataset) : null
  );
  const geoDetection = $derived(selectedDataset?.geoDetection);

  let columnAnalysis = $state<AnalysisResult[]>([]);
  let columnAnalysisLoaded = $state(false);
  let previousAutoSelectedColumn = $state<string | null>(null);
  let columnAnalysisAbort: AbortController | null = null;

  async function loadColumnAnalysis() {
    // Cancel any in-flight analysis
    columnAnalysisAbort?.abort();

    if (!selectedDataset?.tableName) {
      columnAnalysis = [];
      columnAnalysisLoaded = false;
      return;
    }

    const controller = new AbortController();
    columnAnalysisAbort = controller;
    const tableName = selectedDataset.tableName;

    try {
      const result = await duckDBOrchestrator.getFullAnalysis(tableName, true);
      if (controller.signal.aborted) return;
      columnAnalysis = result;
      columnAnalysisLoaded = true;
    } catch {
      if (controller.signal.aborted) return;
      columnAnalysis = [];
      columnAnalysisLoaded = false;
    }
  }

  const dataFieldItems = $derived(() => {
    if (!selectedDataset) return [];

    const datasetColumnNames = selectedDataset.columns
      .filter(
        (col) =>
          col.name !== INTERNAL_COLUMN.GEOMETRY &&
          col.name !== INTERNAL_COLUMN.ID
      )
      .map((col) => col.name);

    const analysisColumnNames = columnAnalysis
      .filter(
        (col) =>
          col.name !== INTERNAL_COLUMN.GEOMETRY &&
          col.name !== INTERNAL_COLUMN.ID
      )
      .map((col) => col.name);

    const allColumnNames = [
      ...new Set([...datasetColumnNames, ...analysisColumnNames])
    ];

    return allColumnNames.map((columnName, index) => {
      const geoCol = geoDetection?.geoColumns.find(
        (gc) => gc.columnName === columnName
      );

      let displayText = columnName;
      if (geoCol) {
        const description = GeoColumnDetector.getGeoColumnDescription(geoCol);
        displayText = `${columnName} – ${description}`;
      }

      return {
        id: index,
        text: displayText,
        columnName,
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

  const hasCategorizedOrNonUnique = $derived.by(() => {
    const selected = suggestedColumn();
    if (!selected || columnAnalysis.length === 0) return false;

    const analysis = columnAnalysis.find(
      (col) => col.name === selected.columnName
    );
    if (!analysis) return false;

    const hasDuplicates =
      analysis.duplicates !== undefined && analysis.duplicates > 0;
    const isCategorical =
      analysis.semioType === 'QL' || analysis.semioType === 'QLO';

    return hasDuplicates || isCategorical;
  });

  function getColumnBadgeType(columnName: string): VariableBadgeType {
    const geoCol = geoDetection?.geoColumns.find(
      (gc) => gc.columnName === columnName
    );
    if (geoCol) return 'geo';

    const colAnalysis = columnAnalysis.find((col) => col.name === columnName);
    if (!colAnalysis) return 'string';

    const isGeoid =
      colAnalysis.semioType === 'geoid' &&
      (colAnalysis.semioScore ?? 0) >= GEOID_SCORE_THRESHOLD;
    if (isGeoid) return 'geo-ref';
    if (colAnalysis.type_simple === 'numeric') return 'numeric';
    if (colAnalysis.type_simple === 'date') return 'date';
    return 'string';
  }

  const linkedVariableBadgeType = $derived.by((): VariableBadgeType => {
    const linkedName = dataTabState.geolocation.linkedVariableName;
    if (!linkedName) return 'string';
    return getColumnBadgeType(linkedName);
  });

  const latitudeBadgeType = $derived.by((): VariableBadgeType => {
    const latCol = dataTabState.geolocation.latitudeColumn;
    if (!latCol) return 'geo';
    return getColumnBadgeType(latCol);
  });

  const longitudeBadgeType = $derived.by((): VariableBadgeType => {
    const lonCol = dataTabState.geolocation.longitudeColumn;
    if (!lonCol) return 'geo';
    return getColumnBadgeType(lonCol);
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
      icon: MapIcon,
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
  let hasAutoGeoreferenceInitialization = $state(false);

  $effect(() => {
    const currentDatasetId = selectedDataset?.id;
    if (currentDatasetId !== previousDatasetId) {
      previousDatasetId = currentDatasetId;
      latitudeFieldId = undefined;
      longitudeFieldId = undefined;
      activeTabIndex = 0;
      columnAnalysisLoaded = false;
      previousAutoSelectedColumn = null;
      hasAutoGeoreferenceInitialization = false;
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
    void duckDBDatasetsVersion;
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

      if (
        !hasAutoGeoreferenceInitialization &&
        hasLatLon &&
        activeTabIndex === 0
      ) {
        activeTabIndex = 1;
        dataTabActions.setGeolocationState({
          geoReference: GeoreferenceType.COORDINATES
        });
      }

      hasAutoGeoreferenceInitialization = true;
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
      // Only auto-select from geoDetection if column analysis is not yet loaded,
      // or if there's no geoid that would override it. This prevents flicker
      // where a suggestion is shown then immediately replaced by a geoid.
      if (
        !columnAnalysisLoaded ||
        !geoid ||
        geoid.columnName === suggested.columnName
      ) {
        previousAutoSelectedColumn = suggested.columnName;
        dataTabActions.setGeolocationState({
          linkedVariable: suggested.id,
          linkedVariableName: suggested.columnName
        });
      }
    }

    if (
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

    let cancelled = false;

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
        if (!cancelled) gpsValidation = result;
      });
    } else {
      gpsValidation = null;
    }

    return () => {
      cancelled = true;
    };
  });
</script>

<section id="geolocation-step">
  <MainToolBarHeader title={m.geo_step_title()} icon={MapIcon} />

  <p class="kh-help">
    {m.geo_step_description()}
    <InfoPopover text={m.geo_step_info()} />
  </p>

  <div class="tab-content">
    <div
      class="geo-controls-grid"
      class:coordinates-mode={activeTabIndex === 1}
      class:compact-mode={isCompact}
    >
      <div class="form-field">
        <div class="field-label">
          {m.geo_reference()}
          <InfoPopover text={m.geo_reference_info()} />
        </div>
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
        <div class="field-label">
          {m.geo_linked_variable()}
          <InfoPopover text={m.geo_linked_variable_info()} />
        </div>
        <div class="combobox-with-badge">
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
          {#if dataTabState.geolocation.linkedVariableName}
            <div class="badge-overlay">
              <VariableBadge
                label={dataTabState.geolocation.linkedVariableName}
                type={linkedVariableBadgeType}
              />
            </div>
          {/if}
        </div>
      </div>

      <div class="form-field" class:hidden={activeTabIndex !== 1}>
        <div class="field-label">
          {m.geo_longitude()}
          <InfoPopover text={m.geo_longitude_info()} />
        </div>
        <div class="combobox-with-badge">
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
          {#if dataTabState.geolocation.longitudeColumn}
            <div class="badge-overlay">
              <VariableBadge
                label={dataTabState.geolocation.longitudeColumn}
                type={longitudeBadgeType}
              />
            </div>
          {/if}
        </div>
      </div>

      <div class="form-field" class:hidden={activeTabIndex !== 1}>
        <div class="field-label">
          {m.geo_latitude()}
          <InfoPopover text={m.geo_latitude_info()} />
        </div>
        <div class="combobox-with-badge">
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
          {#if dataTabState.geolocation.latitudeColumn}
            <div class="badge-overlay">
              <VariableBadge
                label={dataTabState.geolocation.latitudeColumn}
                type={latitudeBadgeType}
              />
            </div>
          {/if}
        </div>
      </div>
    </div>

    {#if activeTabIndex === 0 && suggestedColumn()}
      <InlineNotification
        title={m.geo_notification_title()}
        subtitle={m.geo_notification_subtitle()}
        kind="info"
        lowContrast
        hideCloseButton={false}
      />
    {/if}

    {#if activeTabIndex === 1 && latitudeColumns().length > 0 && longitudeColumns().length > 0}
      <InlineNotification
        title={m.geo_notification_title()}
        subtitle={m.geo_coords_detected_subtitle()}
        kind="info"
        lowContrast
        hideCloseButton={false}
      />
    {/if}

    {#if activeTabIndex === 0 && suggestedColumn() && hasCategorizedOrNonUnique}
      <InlineNotification
        title={m.geo_attention_categorized_title()}
        subtitle={m.geo_attention_categorized_subtitle()}
        kind="warning"
        lowContrast
        hideCloseButton={false}
      />
    {/if}

    {#if activeTabIndex === 1 && gpsValidation?.warning}
      <InlineNotification
        title={gpsValidation.possibleInversion
          ? m.geo_coords_inversion_detected()
          : m.warning_title()}
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
    display: flex;
    flex-direction: column;
  }

  .kh-help {
    color: #6f6f6f;
    margin-bottom: 12px;
    font-size: 14px;
    line-height: 18px;
  }

  .tab-content {
    padding-top: 12px;
  }

  .form-field {
    margin-bottom: 12px;
  }

  .field-label {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    margin-bottom: 4px;
    font-size: 12px;
    color: #6f6f6f;
    font-weight: 500;
  }

  .geo-controls-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    align-items: start;
    margin-bottom: 12px;
  }

  .geo-controls-grid.coordinates-mode {
    grid-template-columns: 1fr 1fr 1fr;
  }

  .geo-controls-grid.compact-mode {
    grid-template-columns: 1fr;
  }

  .geo-controls-grid.compact-mode.coordinates-mode {
    grid-template-columns: 1fr;
  }

  .geo-controls-grid .form-field.hidden {
    display: none;
  }

  .combobox-with-badge {
    position: relative;
  }

  .badge-overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    padding: 0 8px;
    pointer-events: none;
    z-index: var(--z-base);
  }

  /* Hide ComboBox text when badge is showing */
  .combobox-with-badge:has(.badge-overlay) :global(.bx--text-input) {
    color: transparent;
  }

  /* Hide the clear (X) button behind the badge */
  .combobox-with-badge:has(.badge-overlay) :global(.bx--list-box__selection) {
    opacity: 0;
  }

  /* When focused (typing/filtering), hide badge and restore ComboBox */
  .combobox-with-badge:focus-within .badge-overlay {
    display: none;
  }

  .combobox-with-badge:focus-within :global(.bx--text-input) {
    color: inherit !important;
  }

  .combobox-with-badge:focus-within :global(.bx--list-box__selection) {
    opacity: 1 !important;
  }

  .tab-container {
    margin-bottom: 0;
  }

  :global(.geo-tabs) {
    width: 100%;
    max-width: none;
  }
</style>
