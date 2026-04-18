<script lang="ts">
  import { GEOID_SCORE_THRESHOLD } from '$lib/features/commons/components/advanced-data-table/column-type-styles';
  import ToggleTabs from '$lib/features/commons/components/toggle-tabs.svelte';
  import VariableBadge from '$lib/features/commons/components/variable-badge.svelte';
  import type { VariableBadgeType } from '$lib/features/commons/components/variable-badge.types';
  import { GeoreferenceType } from '$lib/features/commons/constants/ui.constants';
  import {
    GEO_COLUMN_TYPE,
    INTERNAL_COLUMN
  } from '$lib/features/commons/constants/data.constants';
  import {
    dataTabActions,
    dataTabState
  } from '$lib/features/commons/store/data-tab.store.svelte';
  import { datasetsStore } from '$lib/features/commons/store/datasets.store.svelte';
  import { globalState } from '$lib/features/commons/store/global.svelte';
  import { ToolbarState } from '$lib/features/commons/types/global';
  import { GeoColumnDetector } from '$lib/features/commons/utils/geo-detector.utils';
  import {
    Duck,
    validateGPSColumns,
    type AnalysisResult,
    type GPSValidationResult
  } from '$lib/features/duckdb';
  import { duckDBOrchestrator } from '$lib/features/duckdb/orchestrator/orchestrator.svelte';
  import { detectGPSColumns } from '$lib/features/duckdb/orchestrator/gps-ops';
  import * as m from '$lib/paraglide/messages';
  import { ComboBox, InlineNotification, Link } from 'carbon-components-svelte';
  import ChartTSne from 'carbon-icons-svelte/lib/ChartTSne.svelte';
  import { Launch, List, Map as MapIcon } from 'carbon-icons-svelte';
  import { InfoPopover } from '../visualization-tab/components/shared';
  import MainToolBarHeader from '../components/main-toolbar-header.svelte';
  import type { GeoComboBoxItem } from './data-tab.shared.types';
  import { dataTabStore } from './data-tab.store.svelte';

  const isCompact = $derived(globalState.toolbarState === ToolbarState.Compact);
  const selectedDataset = $derived(datasetsStore.selectedDataset);
  const duckDBDatasetsVersion = $derived(duckDBOrchestrator.datasetsVersion);
  const geoDetection = $derived(selectedDataset?.geoDetection);

  let columnAnalysis = $state<AnalysisResult[]>([]);
  let columnAnalysisLoaded = $state(false);
  let previousAutoSelectedColumn: string | null = null;
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

    return datasetColumnNames.map((columnName, index) => {
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

  const availableColumnNames = $derived(
    new Set(dataFieldItems().map((item) => item.columnName))
  );

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

  const bestIdentifierFallback = $derived(() => {
    if (columnAnalysis.length === 0) return undefined;

    const items = dataFieldItems();
    const candidates = columnAnalysis
      .filter(
        (col) =>
          col.name !== INTERNAL_COLUMN.GEOMETRY &&
          col.name !== INTERNAL_COLUMN.ID
      )
      .map((col) => {
        const shareUniques = (col.share_uniques as number) ?? 0;
        const shareNulls = (col.share_nulls as number) ?? 0;
        const isString = col.type_simple === 'string';
        const hasIdKeyword =
          col.id_words !== undefined
            ? Boolean(col.id_words)
            : /\b(id|fid|gid|code|iso|pk)\b/i.test(col.name ?? '');
        const score =
          shareUniques * 0.6 +
          (1 - shareNulls) * 0.2 +
          (isString ? 0.1 : 0) +
          (hasIdKeyword ? 0.1 : 0);
        return { name: col.name, score };
      })
      .sort((a, b) => b.score - a.score);

    if (candidates.length === 0) return undefined;
    return items.find((item) => item.columnName === candidates[0].name);
  });

  const suggestedColumn = $derived(() => {
    const geoid = bestGeoidColumn();
    if (geoid) return geoid;

    if (columnAnalysisLoaded) return bestIdentifierFallback();

    return undefined;
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
    if (colAnalysis.type_simple === 'boolean') return 'boolean';
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
    const fallbackCoordinates = detectGPSColumns(columnAnalysis, geoDetection);

    return dataFieldItems().filter((item) => {
      const geoCol = geoDetection?.geoColumns.find(
        (gc) => gc.columnName === item.columnName
      );
      return (
        geoCol?.type === GEO_COLUMN_TYPE.LATITUDE ||
        fallbackCoordinates?.lat === item.columnName
      );
    });
  });

  const longitudeColumns = $derived(() => {
    const fallbackCoordinates = detectGPSColumns(columnAnalysis, geoDetection);

    return dataFieldItems().filter((item) => {
      const geoCol = geoDetection?.geoColumns.find(
        (gc) => gc.columnName === item.columnName
      );
      return (
        geoCol?.type === GEO_COLUMN_TYPE.LONGITUDE ||
        fallbackCoordinates?.lon === item.columnName
      );
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
      icon: List,
      label: m.geo_entities_tab(),
      iconSize: 16
    },
    {
      icon: ChartTSne,
      label: m.geo_coordinates_tab(),
      iconSize: 16
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
  let previousDatasetId: string | undefined = undefined;
  let gpsValidation = $state<GPSValidationResult | null>(null);
  let hasAutoGeoreferenceInitialization = false;

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

      // Don't reset if the geo column was explicitly set (restored from
      // project persistence or manually chosen by the user).
      if (
        !dataTabState.geolocation.autoDetected &&
        dataTabState.geolocation.linkedVariableName
      ) {
        return;
      }

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
    const fallbackCoordinates = detectGPSColumns(columnAnalysis, geoDetection);
    const hasLatLon = Boolean(
      fallbackCoordinates?.lat && fallbackCoordinates?.lon
    );

    if (!geoDetection?.hasGeoColumns && !hasLatLon) {
      hasAutoGeoreferenceInitialization = false;
      return;
    }

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

    if (hasLatLon) {
      if (latitudeColumns().length > 0 && latitudeFieldId === undefined) {
        const col =
          latitudeColumns().find(
            (item) => item.columnName === fallbackCoordinates?.lat
          ) ?? latitudeColumns()[0];
        latitudeFieldId = col.id;
        dataTabActions.setGeolocationState({
          latitudeColumn: col.columnName
        });
      }

      if (longitudeColumns().length > 0 && longitudeFieldId === undefined) {
        const col =
          longitudeColumns().find(
            (item) => item.columnName === fallbackCoordinates?.lon
          ) ?? longitudeColumns()[0];
        longitudeFieldId = col.id;
        dataTabActions.setGeolocationState({
          longitudeColumn: col.columnName
        });
      }
    }
  });

  $effect(() => {
    const availableColumns = availableColumnNames;
    const geolocation = dataTabState.geolocation;

    if (availableColumns.size === 0) return;

    const geolocationUpdates: Partial<typeof geolocation> = {};
    let hasUpdates = false;

    if (
      geolocation.linkedVariableName &&
      !availableColumns.has(geolocation.linkedVariableName)
    ) {
      geolocationUpdates.linkedVariable = null;
      geolocationUpdates.linkedVariableName = '';
      previousAutoSelectedColumn = null;
      hasUpdates = true;
    }

    if (
      geolocation.latitudeColumn &&
      !availableColumns.has(geolocation.latitudeColumn)
    ) {
      geolocationUpdates.latitudeColumn = undefined;
      latitudeFieldId = undefined;
      hasUpdates = true;
    }

    if (
      geolocation.longitudeColumn &&
      !availableColumns.has(geolocation.longitudeColumn)
    ) {
      geolocationUpdates.longitudeColumn = undefined;
      longitudeFieldId = undefined;
      hasUpdates = true;
    }

    if (!hasUpdates) return;

    dataTabActions.setGeolocationState(geolocationUpdates);
    dataTabActions.clearJoinStats();
    dataTabStore.resetStepCompletion(1);
    dataTabStore.resetStepCompletion(2);
  });

  $effect(() => {
    const linkedVar = dataTabState.geolocation.linkedVariable;
    const linkedName = dataTabState.geolocation.linkedVariableName;
    const suggested = suggestedColumn();
    const geoid = bestGeoidColumn();

    if (linkedVar === null && !linkedName && suggested) {
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

  const isGeolocationConfigured = $derived.by(() => {
    const geo = dataTabState.geolocation;
    const isEntityConfigured =
      geo.linkedVariable !== null && geo.linkedVariable !== undefined;
    const isCoordinatesConfigured =
      geo.geoReference === 'coordinates' &&
      geo.latitudeColumn &&
      geo.longitudeColumn;
    return isEntityConfigured || isCoordinatesConfigured;
  });

  $effect(() => {
    if (isGeolocationConfigured) {
      dataTabStore.markStepComplete(1);
    }
  });

  const stepTitle = $derived.by(() => {
    const stepNumber = dataTabStore.getDisplayedStepNumber('geolocate');
    const title = m.geo_step_title();

    return stepNumber === null ? title : `${stepNumber}. ${title}`;
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
  <MainToolBarHeader title={stepTitle} icon={MapIcon} />

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
            on:select={(e) => {
              if (!e.detail.selectedItem) return;
              dataTabActions.setGeolocationState({
                linkedVariable: e.detail.selectedId,
                linkedVariableName:
                  (e.detail.selectedItem as GeoComboBoxItem)?.columnName || ''
              });
            }}
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
              if (!e.detail.selectedItem) return;
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
              if (!e.detail.selectedItem) return;
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
    color: var(--cds-text-secondary);
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
    color: var(--cds-text-secondary);
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

  :global(.geo-tabs .toggle-tab) {
    height: 32px;
  }

  :global(.geo-tabs .toggle-tab.active) {
    background-color: var(--cds-border-subtle-01);
  }
</style>
