<script lang="ts">
  import ToggleTabs from '$lib/features/commons/components/toggle-tabs.svelte';
  import { basemapStyleStore } from '$lib/features/commons/store/basemap-style.store.svelte';
  import { osmBasemapStore } from '$lib/features/map/stores/osm-basemap.store.svelte';
  import {
    getAvailableProjectionIds,
    resolveProjectionAvailabilityContext,
    supportsCustomProjectionCode
  } from '$lib/features/map/utils/projection-availability';
  import { m } from '$lib/paraglide/messages';
  import { Button, ComboBox, TextArea } from 'carbon-components-svelte';
  import { Code, List } from 'carbon-icons-svelte';
  import { createEventDispatcher } from 'svelte';
  import { PROJECTIONS as PROJECTION_CATALOG } from '$lib/features/commons/utils/projection.utils';
  import { getCompositeProjectionSelectionId } from '$lib/features/map/utils/user-projection.utils';
  import { projectionActions } from './projection.store.svelte';

  const dispatch = createEventDispatcher<{
    apply: { code: string };
    reset: void;
  }>();

  let activeTabIndex = $state(0);
  let isCodeView = $state(false);
  let crsCode = $state('');
  let catalogueQuery = $state('');

  const projectionContext = $derived(
    resolveProjectionAvailabilityContext({
      requiresMapLibre: basemapStyleStore.requiresMapLibre,
      hasOSMBasemap: osmBasemapStore.isActive,
      currentStyle: basemapStyleStore.selectedStyle,
      preferredStyle: basemapStyleStore.preferredTiledStyle,
      referenceBasemapId: basemapStyleStore.referenceBasemapId,
      osmBasemapBbox: osmBasemapStore.activeOSMBasemap?.bbox ?? null
    })
  );
  const customCodeEnabled = $derived(
    supportsCustomProjectionCode(projectionContext)
  );
  const compositeItems = $derived([
    {
      id: getCompositeProjectionSelectionId('FRANCE_DOM_TOM'),
      projectionId: getCompositeProjectionSelectionId('FRANCE_DOM_TOM'),
      text: m.projection_name_france_dom_tom()
    },
    {
      id: getCompositeProjectionSelectionId('EUROPE_DOM_TOM'),
      projectionId: getCompositeProjectionSelectionId('EUROPE_DOM_TOM'),
      text: m.projection_name_europe_dom_tom()
    }
  ]);
  const items = $derived(
    [
      ...PROJECTION_CATALOG.map((projection) => ({
        id: projection.id,
        projectionId: projection.id,
        text: projection.name
      })),
      ...compositeItems
    ].filter(
      (projection) =>
        getAvailableProjectionIds(projectionContext, [projection.projectionId])
          .length > 0
    )
  );
  const catalogueLabel = m.projection_catalog_label();
  const viewCodeLabel = m.projection_view_code();
  const otherSearchPlaceholder = m.projection_other_search_placeholder();

  const codeIntro = m.projection_code_intro?.() ?? '';
  const codeLabel = m.projection_code_label();
  const codePlaceholder = m.projection_code_placeholder?.() ?? '';
  const codeHelper = m.projection_code_helper?.() ?? '';
  const resetLabel = m.projection_code_reset();
  const submitLabel = m.projection_code_submit();

  const viewTabs = $derived.by(() => {
    const tabs = [
      {
        icon: List,
        label: catalogueLabel,
        iconSize: 16
      }
    ];

    if (customCodeEnabled) {
      tabs.push({
        icon: Code,
        label: viewCodeLabel,
        iconSize: 16
      });
    }

    return tabs;
  });

  $effect(() => {
    if (customCodeEnabled) {
      return;
    }

    if (activeTabIndex !== 0 || isCodeView) {
      activeTabIndex = 0;
      isCodeView = false;
    }
  });

  function handleViewChange(index: number): void {
    activeTabIndex = index;
    isCodeView = index === 1;
  }

  const isEmpty = () => crsCode.trim().length === 0;

  function onReset() {
    if (isEmpty()) return;
    crsCode = '';
    dispatch('reset');
  }

  function onApply() {
    if (isEmpty()) return;
    dispatch('apply', { code: crsCode.trim() });
  }

  function handleCatalogueSelect(
    event: CustomEvent<{ selectedItem?: { projectionId?: string; id: string } }>
  ): void {
    const selectedProjectionId =
      event.detail.selectedItem?.projectionId ?? event.detail.selectedItem?.id;
    if (!selectedProjectionId) return;

    projectionActions.setSelected(selectedProjectionId);
  }

  function shouldFilterProjectionItem(
    item: { text?: string; projectionId?: string },
    value: string
  ): boolean {
    if (!value) return true;

    const query = value.trim().toLowerCase();
    return (
      item.text?.toLowerCase().includes(query) === true ||
      item.projectionId?.toLowerCase().includes(query) === true
    );
  }
</script>

<div id="khartis-projection-other-tool">
  <div class="other-proj">
    <ToggleTabs
      items={viewTabs}
      activeIndex={activeTabIndex}
      onChange={handleViewChange}
      className="projection-view-tabs"
      hideInactiveLabel={true}
    />

    {#if !isCodeView}
      <div class="catalog-search">
        <ComboBox
          items={items}
          bind:value={catalogueQuery}
          size="sm"
          placeholder={otherSearchPlaceholder}
          shouldFilterItem={shouldFilterProjectionItem}
          on:select={handleCatalogueSelect}
        />
      </div>
    {:else}
      <div class="code-view">
        <p class="intro">{codeIntro}</p>
        <div class="code-form">
          <TextArea
            bind:value={crsCode}
            labelText={codeLabel}
            placeholder={codePlaceholder}
            helperText={codeHelper}
            rows={8}
            light={true}
          />
          <div class="actions">
            <Button
              kind="secondary"
              size="small"
              disabled={isEmpty()}
              on:click={onReset}>{resetLabel}</Button
            >
            <Button
              kind="primary"
              size="small"
              disabled={isEmpty()}
              on:click={onApply}>{submitLabel}</Button
            >
          </div>
        </div>
      </div>
    {/if}
  </div>
</div>

<style lang="scss">
  .other-proj {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-05);
  }

  .catalog-search {
    width: 100%;
    position: relative;
    overflow: visible;
  }

  #khartis-projection-other-tool
    :global(.other-proj .catalog-search:has(.bx--list-box--expanded)) {
    min-height: 14.2rem;
  }

  .code-view {
    padding: var(--cds-spacing-04);
    background: var(--cds-ui-01);
    border-radius: 4px;
    gap: var(--cds-spacing-05);
    display: flex;
    flex-direction: column;

    .intro {
      margin: 0 0 var(--cds-spacing-04) 0;
      color: var(--cds-text-secondary);
      font-size: var(--cds-body-01-font-size);
      line-height: var(--cds-body-01-line-height);
    }

    .code-form {
      display: flex;
      flex-direction: column;
      gap: var(--cds-spacing-05);
    }

    .actions {
      display: flex;
      gap: var(--cds-spacing-04);
      justify-content: flex-end;
    }
  }

  #khartis-projection-other-tool :global(.projection-view-tabs) {
    margin-bottom: var(--cds-spacing-03);
  }

  #khartis-projection-other-tool :global(.projection-view-tabs .toggle-tab) {
    font-size: 0.875rem;
    padding: 6px 12px;
    min-height: 32px;
  }

  #khartis-projection-other-tool :global(.projection-view-tabs .toggle-icon) {
    width: 16px;
    height: 16px;
  }
</style>
