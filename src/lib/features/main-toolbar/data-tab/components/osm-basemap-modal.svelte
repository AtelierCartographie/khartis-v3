<script lang="ts">
  import { m } from '$lib/paraglide/messages';
  import {
    Modal,
    Select,
    SelectItem,
    Toggle,
    InlineNotification
  } from 'carbon-components-svelte';
  import type { BasemapMetadata } from '$lib/features/map/types/basemap.types';

  interface Props {
    open: boolean;
    hasGPSCoordinates: boolean;
    onClose: () => void;
    onSelect: (basemap: BasemapMetadata) => void;
  }

  let {
    open = $bindable(),
    hasGPSCoordinates,
    onClose,
    onSelect
  }: Props = $props();

  let selectedStyle = $state('osm-standard');
  let showLabels = $state(true);
  let showRoads = $state(true);
  let showBuildings = $state(false);

  const osmStyles = [
    { value: 'osm-standard', label: m.osm_modal_style_standard() },
    { value: 'osm-carto', label: m.osm_modal_style_carto() },
    { value: 'osm-humanitarian', label: m.osm_modal_style_humanitarian() },
    { value: 'osm-transport', label: m.osm_modal_style_transport() }
  ];

  function handleConfirm() {
    if (!hasGPSCoordinates) {
      return;
    }

    // Create OSM basemap metadata
    const styleLabel =
      osmStyles.find((s) => s.value === selectedStyle)?.label || selectedStyle;
    const osmBasemap: BasemapMetadata = {
      file: `osm_${selectedStyle}_${Date.now()}`,
      title: m.osm_basemap_title({ style: styleLabel }),
      description: m.osm_basemap_description(),
      source: m.osm_basemap_source(),
      date: new Date().getFullYear().toString(),
      bbox: [-180, -90, 180, 90],
      projection: 'EPSG:3857', // Web Mercator
      layers: [
        {
          name: 'base',
          type: 'polygon'
        },
        ...(showRoads
          ? [
              {
                name: 'roads',
                type: 'line' as const
              }
            ]
          : []),
        ...(showBuildings
          ? [
              {
                name: 'buildings',
                type: 'polygon' as const
              }
            ]
          : []),
        ...(showLabels
          ? [
              {
                name: 'labels',
                type: 'point' as const
              }
            ]
          : [])
      ],
      isCustom: true
    };

    onSelect(osmBasemap);
    onClose();
  }
</script>

<Modal
  bind:open={open}
  modalHeading={m.osm_modal_title()}
  primaryButtonText={m.osm_modal_button_add()}
  secondaryButtonText={m.osm_modal_button_cancel()}
  primaryButtonDisabled={!hasGPSCoordinates}
  size="sm"
  on:click:button--secondary={onClose}
  on:submit={handleConfirm}
  on:close={onClose}
>
  <div class="modal-content">
    {#if !hasGPSCoordinates}
      <InlineNotification
        kind="warning"
        title={m.osm_modal_gps_required_title()}
        subtitle={m.osm_modal_gps_required_subtitle()}
        hideCloseButton={true}
        lowContrast
      />
    {:else}
      <p class="description">
        {m.osm_modal_description()}
      </p>

      <Select
        labelText={m.osm_modal_style_label()}
        bind:selected={selectedStyle}
        helperText={m.osm_modal_style_helper()}
      >
        {#each osmStyles as style (style.value)}
          <SelectItem value={style.value} text={style.label} />
        {/each}
      </Select>

      <div class="toggles">
        <h4>{m.osm_modal_layers_title()}</h4>

        <Toggle
          labelText={m.osm_modal_layer_labels()}
          bind:toggled={showLabels}
          labelA={m.osm_modal_layer_hide()}
          labelB={m.osm_modal_layer_show()}
        />

        <Toggle
          labelText={m.osm_modal_layer_roads()}
          bind:toggled={showRoads}
          labelA={m.osm_modal_layer_hide()}
          labelB={m.osm_modal_layer_show()}
        />

        <Toggle
          labelText={m.osm_modal_layer_buildings()}
          bind:toggled={showBuildings}
          labelA={m.osm_modal_layer_hide()}
          labelB={m.osm_modal_layer_show()}
        />
      </div>

      <InlineNotification
        kind="info"
        title={m.osm_modal_note_title()}
        subtitle={m.osm_modal_note_subtitle()}
        hideCloseButton={true}
        lowContrast
      />
    {/if}
  </div>
</Modal>

<style>
  .modal-content {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .description {
    margin: 0;
    color: var(--cds-text-02);
    font-size: 0.875rem;
    line-height: 1.5;
  }

  .toggles {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 1rem;
    background-color: var(--cds-ui-01);
    border-radius: 4px;
  }

  .toggles h4 {
    margin: 0 0 0.5rem 0;
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--cds-text-01);
  }
</style>
