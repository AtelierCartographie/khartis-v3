<script lang="ts">
  import ToggleTabs from '$lib/features/commons/components/toggle-tabs.svelte';
  import {
    dataTabActions,
    dataTabState
  } from '$lib/features/commons/store/data-tab.store.svelte';
  import * as m from '$lib/paraglide/messages';
  import { ComboBox, InlineNotification, Link } from 'carbon-components-svelte';
  import { Launch, Location, Map } from 'carbon-icons-svelte';
  import MainToolBarHeader from '../components/main-toolbar-header.svelte';

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

  let latitudeFieldId = $state<number | undefined>();
  let longitudeFieldId = $state<number | undefined>();
</script>

<section id="geolocation-step">
  <MainToolBarHeader title={m.geo_step_title()} />

  <p class="kh-help">
    {m.geo_step_description()}
  </p>

  <div class="form-field">
    <div class="field-label">{m.geo_reference()}</div>
    <div class="tab-container">
      <ToggleTabs
        bind:activeIndex={activeTabIndex}
        items={tabItems}
        onChange={handleTabChange}
        className="geo-tabs"
      />
    </div>
  </div>

  {#if activeTabIndex === 0}
    <div class="tab-content">
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
          <div class="field-label">{m.geo_longitude()}</div>
          <ComboBox
            items={dataFieldItems}
            selectedId={longitudeFieldId}
            on:select={(e) => (longitudeFieldId = e.detail.selectedId)}
            placeholder={m.geo_select_longitude()}
            titleText=""
          />
        </div>

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
      </div>

      <Link href={GEO_LEARN_MORE_URL} target="_blank">
        {m.geo_learn_more_geocoding()}
        <Launch size={16} />
      </Link>

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
