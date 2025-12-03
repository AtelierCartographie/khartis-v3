<script lang="ts">
  import ToggleTabs from '$lib/features/commons/components/toggle-tabs.svelte';
  import { ComboBox, InlineNotification, Link } from 'carbon-components-svelte';
  import { Launch, ListBoxes, Location } from 'carbon-icons-svelte';
  import type { GeoColumnDetection } from './types/basemap.types';
  import { m } from '$lib/paraglide/messages';

  interface ComboBoxItem {
    id: number;
    text: string;
    columnName: string;
  }

  interface Props {
    columns: Array<{ name: string; type: string }>;
    geoDetection: GeoColumnDetection;
    onColumnChange?: (columnName: string, geoType: string) => void;
    onGeolocationChange?: (config: {
      geoType: 'coordinates' | 'entities';
      linkedVariable?: string;
      latitudeColumn?: string;
      longitudeColumn?: string;
    }) => void;
  }

  const { columns, geoDetection, onColumnChange, onGeolocationChange }: Props =
    $props();

  const hasLatLon = $derived(
    !!(geoDetection.latitudeColumn && geoDetection.longitudeColumn)
  );

  let activeTabIndex = $state(0);
  let hasInitialized = $state(false);

  $effect(() => {
    if (!hasInitialized && hasLatLon) {
      activeTabIndex = 1;
      hasInitialized = true;
    }
  });

  const tabItems = [
    {
      icon: ListBoxes,
      label: m.geo_entities_tab(),
      iconSize: 20
    },
    {
      icon: Location,
      label: m.geo_coordinates_tab(),
      iconSize: 20
    }
  ];

  const dataFieldItems = $derived(
    columns
      .filter((col) => col.type === 'string' || col.type === 'text')
      .map((col, index) => ({
        id: index,
        text: col.name,
        columnName: col.name
      }))
  );

  const numericAndTextItems = $derived(
    columns
      .filter(
        (col) =>
          col.type === 'string' ||
          col.type === 'text' ||
          col.type === 'number' ||
          col.type === 'numeric'
      )
      .map((col, index) => ({
        id: index,
        text: col.name,
        columnName: col.name
      }))
  );

  const defaultLinkedVariableId = $derived(() => {
    const geoColumn = geoDetection.geoCodeColumn || geoDetection.locationColumn;
    if (geoColumn) {
      const found = dataFieldItems.find(
        (item) => item.columnName === geoColumn
      );
      return found?.id;
    }
    return dataFieldItems.length > 0 ? dataFieldItems[0].id : undefined;
  });

  const defaultLatitudeId = $derived(() => {
    if (geoDetection.latitudeColumn) {
      const found = numericAndTextItems.find(
        (item) => item.columnName === geoDetection.latitudeColumn
      );
      return found?.id;
    }
    return undefined;
  });

  const defaultLongitudeId = $derived(() => {
    if (geoDetection.longitudeColumn) {
      const found = numericAndTextItems.find(
        (item) => item.columnName === geoDetection.longitudeColumn
      );
      return found?.id;
    }
    return undefined;
  });

  let selectedLinkedVariableId = $state<number | undefined>(undefined);
  let selectedLatitudeId = $state<number | undefined>(undefined);
  let selectedLongitudeId = $state<number | undefined>(undefined);

  $effect(() => {
    if (selectedLinkedVariableId === undefined) {
      selectedLinkedVariableId = defaultLinkedVariableId();
    }
  });

  $effect(() => {
    if (selectedLatitudeId === undefined) {
      selectedLatitudeId = defaultLatitudeId();
    }
  });

  $effect(() => {
    if (selectedLongitudeId === undefined) {
      selectedLongitudeId = defaultLongitudeId();
    }
  });

  const GEO_LEARN_MORE_URL =
    'https://cartographie.sciencespo.fr/khartis/help/geocoding';

  function handleTabChange(index: number) {
    activeTabIndex = index;
    propagateChange();
  }

  function handleLinkedVariableSelect(
    event: CustomEvent<{ selectedId: number; selectedItem: ComboBoxItem }>
  ) {
    selectedLinkedVariableId = event.detail.selectedId;
    const item = event.detail.selectedItem;
    if (item) {
      onColumnChange?.(item.columnName, 'entities');
    }
    propagateChange();
  }

  function handleLatitudeSelect(
    event: CustomEvent<{ selectedId: number; selectedItem: ComboBoxItem }>
  ) {
    selectedLatitudeId = event.detail.selectedId;
    propagateChange();
  }

  function handleLongitudeSelect(
    event: CustomEvent<{ selectedId: number; selectedItem: ComboBoxItem }>
  ) {
    selectedLongitudeId = event.detail.selectedId;
    propagateChange();
  }

  function propagateChange() {
    if (activeTabIndex === 0) {
      const linkedItem = dataFieldItems.find(
        (item) => item.id === selectedLinkedVariableId
      );
      onGeolocationChange?.({
        geoType: 'entities',
        linkedVariable: linkedItem?.columnName
      });
    } else {
      const latItem = numericAndTextItems.find(
        (item) => item.id === selectedLatitudeId
      );
      const lonItem = numericAndTextItems.find(
        (item) => item.id === selectedLongitudeId
      );
      onGeolocationChange?.({
        geoType: 'coordinates',
        latitudeColumn: latItem?.columnName,
        longitudeColumn: lonItem?.columnName
      });
    }
  }
</script>

<section class="geolocation-step">
  <div class="step-header">
    <h3>{m.geo_step_title()}</h3>
    <p class="step-description">
      {m.geo_step_description()}
    </p>
  </div>

  <div class="controls-grid">
    <div class="form-field toggle-field">
      <div class="field-label">{m.geo_reference()}</div>
      <ToggleTabs
        activeIndex={activeTabIndex}
        items={tabItems}
        onChange={handleTabChange}
        className="geo-toggle"
      />
    </div>

    <div class="form-field" class:hidden={activeTabIndex !== 0}>
      <div class="field-label">{m.geo_linked_variable()}</div>
      <ComboBox
        items={dataFieldItems}
        selectedId={selectedLinkedVariableId}
        on:select={handleLinkedVariableSelect}
        placeholder={m.geo_select_variable()}
      />
    </div>

    <div class="form-field" class:hidden={activeTabIndex !== 1}>
      <div class="field-label">{m.geo_longitude()}</div>
      <ComboBox
        items={numericAndTextItems}
        selectedId={selectedLongitudeId}
        on:select={handleLongitudeSelect}
        placeholder={m.geo_select_longitude()}
      />
    </div>

    <div class="form-field" class:hidden={activeTabIndex !== 1}>
      <div class="field-label">{m.geo_latitude()}</div>
      <ComboBox
        items={numericAndTextItems}
        selectedId={selectedLatitudeId}
        on:select={handleLatitudeSelect}
        placeholder={m.geo_select_latitude()}
      />
    </div>
  </div>

  {#if geoDetection.hasGeoColumns}
    <InlineNotification
      kind="info"
      title={m.geo_notification_title()}
      subtitle={m.geo_notification_subtitle()}
      lowContrast
      hideCloseButton
    />
  {/if}

  <div class="learn-more-link">
    <Link href={GEO_LEARN_MORE_URL} target="_blank">
      {m.geo_learn_more_geocoding()}
      <Launch size={16} />
    </Link>
  </div>
</section>

<style>
  .geolocation-step {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-05);
  }

  .step-header h3 {
    font-size: 1.125rem;
    font-weight: 600;
    margin-bottom: var(--cds-spacing-02);
  }

  .step-description {
    font-size: 0.875rem;
    color: var(--cds-text-secondary);
  }

  .controls-grid {
    display: flex;
    flex-wrap: wrap;
    gap: var(--cds-spacing-05);
    align-items: end;
  }

  .controls-grid .form-field {
    flex: 1;
    min-width: 150px;
  }

  .controls-grid .form-field.hidden {
    display: none;
  }

  .form-field {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-02);
  }

  .field-label {
    font-size: 0.75rem;
    font-weight: 400;
    color: var(--cds-text-secondary);
    letter-spacing: 0.32px;
  }

  :global(.geo-toggle) {
    width: 100%;
  }

  .learn-more-link {
    display: inline-flex;
    align-items: center;
    gap: var(--cds-spacing-02);
  }

  .learn-more-link :global(a) {
    display: inline-flex;
    align-items: center;
    gap: var(--cds-spacing-02);
  }

  @media (max-width: 672px) {
    .controls-grid {
      flex-direction: column;
    }

    .controls-grid .form-field {
      width: 100%;
    }
  }
</style>
