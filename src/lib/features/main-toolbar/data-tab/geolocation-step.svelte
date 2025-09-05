<script lang="ts">
  import Separator from '$lib/features/commons/components/separator.svelte';
  import ToggleTabs from '$lib/features/commons/components/toggle-tabs.svelte';
  import * as m from '$lib/paraglide/messages';
  import {
    ComboBox,
    InlineNotification,
    Select,
    SelectItem
  } from 'carbon-components-svelte';
  import { Location, Map } from 'carbon-icons-svelte';
  import { dataTabActions, dataTabState } from './data-tab.store.svelte';

  const dataFields = [
    'Nom pays',
    'ISO3',
    'Code pays',
    'Latitude',
    'Longitude',
    'X',
    'Y'
  ];
  const dataFieldItems = dataFields.map((text, id) => ({ id, text }));

  const geoFieldId = $derived(dataTabState.geolocation.linkedVariable);
  const geoRef = $derived(dataTabState.geolocation.geoReference);

  let activeTabIndex = $state(0);

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
  }

  let latitudeFieldId = $state<number | undefined>();
  let longitudeFieldId = $state<number | undefined>();
  let projectionValue = $state('wgs84');
</script>

<section>
  <header class="geo-header">
    <div class="geo-title">
      <Map size={24} />
      <h5>{m.geo_step_title()}</h5>
    </div>
    <Separator orientation="horizontal" />
  </header>

  <p class="kh-help">
    {m.geo_step_description()}
  </p>

  <div class="tab-container">
    <ToggleTabs
      bind:activeIndex={activeTabIndex}
      items={tabItems}
      onChange={handleTabChange}
      className="geo-tabs"
    />
  </div>

  {#if activeTabIndex === 0}
    <div class="tab-content">
      <div class="form-field">
        <Select
          id="geo-ref"
          labelText={m.geo_reference()}
          selected={geoRef}
          size="xl"
          on:change={(e) => {
            const event = e as CustomEvent<{
              selectedValue: 'admin' | 'places' | 'custom';
            }>;
            dataTabActions.setGeolocationState({
              geoReference: event.detail.selectedValue
            });
          }}
        >
          <SelectItem value="admin" text={m.geo_admin_entities()} />
          <SelectItem value="places" text={m.geo_places()} />
          <SelectItem value="custom" text={m.geo_custom()} />
        </Select>
      </div>

      <div class="form-field">
        <div class="field-label">{m.geo_linked_variable()}</div>
        <ComboBox
          items={dataFieldItems}
          selectedId={geoFieldId}
          on:select={(e) =>
            dataTabActions.setGeolocationState({
              linkedVariable: e.detail.selectedId,
              linkedVariableName: e.detail.selectedItem?.text || ''
            })}
          placeholder={m.geo_select_variable()}
          titleText=""
        />
      </div>

      <InlineNotification
        title={m.geo_notification_title()}
        subtitle={m.geo_notification_subtitle()}
        kind="info"
        lowContrast
        hideCloseButton={false}
      />
    </div>
  {:else}
    <div class="tab-content">
      <div class="form-row">
        <div class="form-field flex-1">
          <div class="field-label">{m.geo_latitude()}</div>
          <ComboBox
            items={dataFieldItems}
            selectedId={latitudeFieldId}
            on:select={(e) => (latitudeFieldId = e.detail.selectedId)}
            placeholder={m.geo_select_latitude()}
            titleText=""
          />
        </div>

        <div class="form-field flex-1">
          <div class="field-label">{m.geo_longitude()}</div>
          <ComboBox
            items={dataFieldItems}
            selectedId={longitudeFieldId}
            on:select={(e) => (longitudeFieldId = e.detail.selectedId)}
            placeholder={m.geo_select_longitude()}
            titleText=""
          />
        </div>
      </div>

      <div class="form-field">
        <Select
          id="geo-projection"
          labelText={m.geo_projection()}
          selected={projectionValue}
          size="xl"
          on:change={(e) => {
            const event = e as CustomEvent<{ selectedValue: string }>;
            projectionValue = event.detail.selectedValue;
          }}
        >
          <SelectItem value="wgs84" text={m.geo_projection_wgs84()} />
          <SelectItem value="mercator" text={m.geo_projection_mercator()} />
        </Select>
      </div>

      <InlineNotification
        title={m.geo_notification_title()}
        subtitle={m.geo_notification_subtitle()}
        kind="info"
        lowContrast
        hideCloseButton={false}
      />
    </div>
  {/if}
</section>

<style>
  .geo-header .geo-title {
    display: flex;
    align-items: center;
    gap: var(--cds-spacing-04);
    margin-bottom: var(--cds-spacing-03);
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

  .form-row {
    display: flex;
    gap: var(--cds-spacing-05);
  }

  .flex-1 {
    flex: 1;
  }

  .field-label {
    margin-bottom: var(--cds-spacing-03);
    font-size: 0.875rem;
    color: var(--cds-text-02);
    font-weight: 500;
  }

  :global(.geo-tabs) {
    max-width: 500px;
  }
</style>
