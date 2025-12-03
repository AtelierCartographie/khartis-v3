<script lang="ts">
  import ToggleTabs from '$lib/features/commons/components/toggle-tabs.svelte';
  import {
    dataTabActions,
    dataTabState
  } from '$lib/features/commons/store/data-tab.store.svelte';
  import { datasetsStore } from '$lib/features/commons/store/datasets.store.svelte';
  import { GeoColumnDetector } from '$lib/features/commons/utils/geo-detector.utils';
  import { normalizeToProcessedDataset } from '$lib/features/data-pipeline/utils/processed-dataset.utils';
  import { basemapCatalogService } from '$lib/features/map/services/basemap-catalog.service.svelte';
  import * as m from '$lib/paraglide/messages';
  import { ComboBox, InlineNotification, Link } from 'carbon-components-svelte';
  import { Launch, Location, Map } from 'carbon-icons-svelte';
  import MainToolBarHeader from '../components/main-toolbar-header.svelte';

  interface GeoComboBoxItem {
    id: number;
    text: string;
    columnName: string;
    isGeo: boolean;
    confidence: number;
  }

  const selectedDataset = $derived(datasetsStore.selectedDataset);
  const processedDataset = $derived.by(() =>
    selectedDataset ? normalizeToProcessedDataset(selectedDataset) : null
  );
  const geoDetection = $derived(selectedDataset?.geoDetection);

  const hasTypeDetection = $derived(
    !!selectedDataset && selectedDataset.columns.length > 0
  );

  const hasMissingValues = $derived(
    processedDataset
      ? processedDataset.columns.some((col) => col.nullable === true)
      : false
  );

  const showVariableTypesNotification = $derived(
    dataTabState.notifications.variableTypes && hasTypeDetection
  );

  const showWarningsNotification = $derived(
    dataTabState.notifications.warnings && hasMissingValues
  );

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

  const suggestedColumn = $derived(() => {
    const suggested = geoDetection?.suggestedPrimaryGeoColumn;
    if (!suggested) return undefined;

    return dataFieldItems().find(
      (item) => item.columnName === suggested.columnName
    );
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
    dataTabState.geolocation.geoReference === 'coordinates' ? 1 : 0
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
      geoReference: index === 1 ? 'coordinates' : 'entities'
    });
  }

  let latitudeFieldId = $state<number | undefined>(undefined);
  let longitudeFieldId = $state<number | undefined>(undefined);

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
    if (selectedDataset) {
      if (hasTypeDetection && !dataTabState.notifications.variableTypes) {
        dataTabActions.toggleNotification('variableTypes');
      }

      if (hasMissingValues && !dataTabState.notifications.warnings) {
        dataTabActions.toggleNotification('warnings');
      }
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
          geoReference: 'coordinates'
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

    if (linkedVar === null && !linkedName && suggested) {
      dataTabActions.setGeolocationState({
        linkedVariable: suggested.id,
        linkedVariableName: suggested.columnName
      });
    }
  });

  $effect(() => {
    const linkedVar = dataTabState.geolocation.linkedVariable;
    if (linkedVar !== undefined && linkedVar !== null && selectedDataset) {
      autoSelectBasemap();
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
      <InlineNotification
        title="Colonne géographique détectée"
        subtitle={`La colonne "${suggestedColumn()!.columnName}" a été automatiquement sélectionnée (confiance: ${Math.round(suggestedColumn()!.confidence * 100)}%)`}
        kind="success"
        lowContrast
        hideCloseButton={false}
      />
    {/if}

    {#if activeTabIndex === 1 && latitudeColumns().length > 0 && longitudeColumns().length > 0}
      <InlineNotification
        title="Colonnes de coordonnées détectées"
        subtitle="Les colonnes de latitude et longitude ont été automatiquement sélectionnées"
        kind="success"
        lowContrast
        hideCloseButton={false}
      />
    {/if}

    <Link href={GEO_LEARN_MORE_URL} target="_blank">
      {m.geo_learn_more_geocoding()}
      <Launch size={16} />
    </Link>

    {#if showVariableTypesNotification}
      <InlineNotification
        title={m.geo_notification_title()}
        subtitle={m.geo_notification_subtitle()}
        kind="info"
        lowContrast
        hideCloseButton={false}
        on:close={() => dataTabActions.toggleNotification('variableTypes')}
      />
    {/if}

    {#if showWarningsNotification}
      <InlineNotification
        title="Valeurs manquantes"
        subtitle="Certaines colonnes contiennent des valeurs manquantes qui pourraient affecter les visualisations."
        kind="warning"
        lowContrast
        hideCloseButton={false}
        on:close={() => dataTabActions.toggleNotification('warnings')}
      />
    {/if}
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
