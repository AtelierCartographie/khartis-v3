<script lang="ts">
  import {
    InlineNotification,
    Select,
    SelectItem,
    Tag,
    Tile
  } from 'carbon-components-svelte';
  import { Checkmark, Location, WarningAlt } from 'carbon-icons-svelte';
  import type { GeoColumnDetection } from './types/basemap.types';
  import { m } from '$lib/paraglide/messages';

  interface Props {
    columns: Array<{ name: string; type: string }>;
    geoDetection: GeoColumnDetection;
    onColumnChange?: (columnName: string, geoType: string) => void;
  }

  const { columns, geoDetection, onColumnChange }: Props = $props();

  let selectedGeoColumn = $state(
    geoDetection.geoCodeColumn ||
      geoDetection.locationColumn ||
      geoDetection.latitudeColumn ||
      ''
  );

  function handleColumnChange(event: Event) {
    const target = event.target as HTMLSelectElement;
    selectedGeoColumn = target.value;
    onColumnChange?.(target.value, geoDetection.detectedType || 'geo_code');
  }
</script>

<section class="geolocation-step">
  <div class="step-header">
    <h3>{m.geolocation_step_title()}</h3>
    <p class="step-description">
      {m.geolocation_step_description()}
    </p>
  </div>

  {#if geoDetection.hasGeoColumns}
    <Tile class="detection-result">
      <div class="detection-header">
        <Checkmark size={24} class="success-icon" />
        <div class="detection-info">
          <h4>{m.geo_columns_detected()}</h4>
          <p class="detection-type">
            {#if geoDetection.detectedType === 'coordinates'}
              {m.detection_type_coordinates()}
            {:else if geoDetection.detectedType === 'geo_code'}
              {m.detection_type_geo_code()}
            {:else if geoDetection.detectedType === 'location_name'}
              {m.detection_type_location_name()}
            {/if}
          </p>
        </div>
      </div>

      <div class="detected-columns">
        {#if geoDetection.latitudeColumn}
          <Tag type="blue" size="sm">
            <Location size={16} />
            Latitude: {geoDetection.latitudeColumn}
          </Tag>
        {/if}

        {#if geoDetection.longitudeColumn}
          <Tag type="blue" size="sm">
            <Location size={16} />
            Longitude: {geoDetection.longitudeColumn}
          </Tag>
        {/if}

        {#if geoDetection.geoCodeColumn}
          <Tag type="green" size="sm">
            Code: {geoDetection.geoCodeColumn}
          </Tag>
        {/if}

        {#if geoDetection.locationColumn}
          <Tag type="purple" size="sm">
            Location: {geoDetection.locationColumn}
          </Tag>
        {/if}
      </div>

      <div class="column-selector">
        <Select
          labelText={m.select_reference_column()}
          selected={selectedGeoColumn}
          on:change={handleColumnChange}
        >
          {#each columns.filter((c) => c.type === 'string' || c.type === 'number') as column}
            <SelectItem value={column.name} text={column.name} />
          {/each}
        </Select>
      </div>
    </Tile>
  {:else}
    <InlineNotification
      kind="warning"
      title={m.no_geo_columns_detected()}
      subtitle={m.no_geo_columns_help()}
      hideCloseButton
    >
      <div slot="subtitle">
        <p>{m.no_geo_columns_help()}</p>
        <ul class="geo-requirements">
          <li>{m.geo_requirement_coordinates()}</li>
          <li>{m.geo_requirement_codes()}</li>
          <li>{m.geo_requirement_names()}</li>
        </ul>
      </div>
    </InlineNotification>

    <div class="manual-selector">
      <Select
        labelText={m.manually_select_geo_column()}
        selected={selectedGeoColumn}
        on:change={handleColumnChange}
      >
        <SelectItem value="" text={m.select_column()} />
        {#each columns as column}
          <SelectItem value={column.name} text={column.name} />
        {/each}
      </Select>
    </div>
  {/if}
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

  .detection-result {
    padding: var(--cds-spacing-05);
  }

  .detection-header {
    display: flex;
    align-items: flex-start;
    gap: var(--cds-spacing-04);
    margin-bottom: var(--cds-spacing-04);
  }

  .detection-header :global(.success-icon) {
    color: var(--cds-support-success);
    flex-shrink: 0;
  }

  .detection-info h4 {
    font-size: 1rem;
    font-weight: 600;
    margin-bottom: var(--cds-spacing-02);
  }

  .detection-type {
    font-size: 0.875rem;
    color: var(--cds-text-secondary);
  }

  .detected-columns {
    display: flex;
    flex-wrap: wrap;
    gap: var(--cds-spacing-03);
    margin-bottom: var(--cds-spacing-05);
  }

  .detected-columns :global(.bx--tag) {
    display: inline-flex;
    align-items: center;
    gap: var(--cds-spacing-02);
  }

  .column-selector {
    margin-top: var(--cds-spacing-04);
  }

  .geo-requirements {
    margin-top: var(--cds-spacing-03);
    margin-left: var(--cds-spacing-05);
    font-size: 0.875rem;
    color: var(--cds-text-secondary);
  }

  .geo-requirements li {
    margin-bottom: var(--cds-spacing-02);
  }

  .manual-selector {
    margin-top: var(--cds-spacing-04);
  }
</style>
