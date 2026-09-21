<script lang="ts">
  import ToggleTabs from '$lib/features/commons/components/toggle-tabs.svelte';
  import { basemapStyleStore } from '$lib/features/commons/stores/basemap-style.store.svelte';
  import {
    basemapService,
    osmBasemapStore,
    projectionStore as mapRenderProjectionStore
  } from '$lib/features/map';
  import {
    getAvailableProjectionIds,
    resolveProjectionAvailabilityContext,
    supportsCustomProjectionCode
  } from '$lib/features/map/utils/projection-availability.utils';
  import { m } from '$lib/paraglide/messages';
  import {
    Button,
    ComboBox,
    InlineNotification,
    TextArea
  } from 'carbon-components-svelte';
  import { Code, List as ListIcon } from 'carbon-icons-svelte';
  import {
    PROJECTIONS as PROJECTION_CATALOG,
    type ProjectionInfo
  } from '$lib/features/commons/utils/projection.utils';
  import { getCompositeProjectionSelectionId } from '$lib/features/map/utils/user-projection.utils';
  import {
    getProjectionState,
    projectionActions
  } from './projection.store.svelte';
  import {
    getProjectionShapeFilterId,
    type ProjectionShapeFilterId
  } from './projection-label.utils';

  type ProjectionCatalogueItem = {
    id: string;
    projectionId: string;
    title: string;
    tag: string;
    shapeFilterId?: ProjectionShapeFilterId;
  };

  type Props = {
    onapply?: (payload: { code: string }) => void;
    onreset?: () => void;
  };

  let { onapply, onreset }: Props = $props();

  let requestedTabIndex = $state(0);
  let crsCodeDraft = $state<string | null>(null);

  const projectionState = $derived(getProjectionState());
  const crsCode = $derived(crsCodeDraft ?? projectionState.customCode ?? '');
  const projectionContext = $derived(
    resolveProjectionAvailabilityContext({
      requiresMapLibre: basemapStyleStore.requiresMapLibre,
      hasOSMBasemap: osmBasemapStore.isActive,
      currentStyle: basemapStyleStore.selectedStyle,
      preferredStyle: basemapStyleStore.preferredTiledStyle,
      referenceBasemapId: basemapStyleStore.referenceBasemapId,
      referenceProjectionPresetId: basemapStyleStore.referenceBasemapId
        ? (basemapService.currentMetadata?.proj_to?.preset ?? null)
        : null,
      osmBasemapBbox: osmBasemapStore.activeOSMBasemap?.bbox ?? null,
      projectionBbox: mapRenderProjectionStore.isProjectedCoordinates
        ? null
        : mapRenderProjectionStore.referenceBbox,
      projectionPresets: basemapService.projectionPresets
    })
  );
  const customCodeEnabled = $derived(
    supportsCustomProjectionCode(projectionContext)
  );
  const activeTabIndex = $derived(customCodeEnabled ? requestedTabIndex : 0);
  const isCodeView = $derived(customCodeEnabled && activeTabIndex === 1);
  const compositeItems = $derived([
    {
      id: getCompositeProjectionSelectionId('FRANCE_DOM_TOM'),
      projectionId: getCompositeProjectionSelectionId('FRANCE_DOM_TOM'),
      title: m.projection_name_france_dom_tom(),
      tag: m.projection_group_discontinuous(),
      shapeFilterId: 'Discontinue' as ProjectionShapeFilterId
    },
    {
      id: getCompositeProjectionSelectionId('EUROPE_DOM_TOM'),
      projectionId: getCompositeProjectionSelectionId('EUROPE_DOM_TOM'),
      title: m.projection_name_europe_dom_tom(),
      tag: m.projection_group_discontinuous(),
      shapeFilterId: 'Discontinue' as ProjectionShapeFilterId
    },
    {
      id: getCompositeProjectionSelectionId('USA_ALBERS'),
      projectionId: getCompositeProjectionSelectionId('USA_ALBERS'),
      title: m.projection_name_usa_albers(),
      tag: m.projection_group_discontinuous(),
      shapeFilterId: 'Discontinue' as ProjectionShapeFilterId
    }
  ]);

  const projectionGroups = $derived.by(
    (): ReadonlyArray<{
      id: ProjectionShapeFilterId;
      label: string;
    }> => [
      { id: 'Rectangulaire', label: m.projection_group_rectangular() },
      { id: 'Arrondie', label: m.projection_group_rounded() },
      { id: 'Discontinue', label: m.projection_group_discontinuous() }
    ]
  );

  const items = $derived.by((): ProjectionCatalogueItem[] =>
    [
      ...PROJECTION_CATALOG.map(createProjectionCatalogueItem),
      ...compositeItems
    ].filter(
      (projection) =>
        getAvailableProjectionIds(projectionContext, [projection.projectionId])
          .length > 0
    )
  );
  type ProjectionCatalogueComboItem = {
    id: string;
    text: string;
    item: ProjectionCatalogueItem;
  };
  const catalogueComboItems = $derived.by((): ProjectionCatalogueComboItem[] =>
    items.map((item) => ({
      id: item.id,
      text: item.tag ? `${item.title} · ${item.tag}` : item.title,
      item
    }))
  );
  const catalogueItemsSignature = $derived(
    items.map((item) => item.id).join('|')
  );
  const catalogueLabel = $derived(m.projection_catalog_label());
  const viewCodeLabel = $derived(m.projection_view_code());

  const description = $derived(m.projection_description());
  const codeIntro = $derived(m.projection_code_intro());
  const codeLabel = $derived(m.projection_code_label());
  const codePlaceholder = $derived(m.projection_code_placeholder());
  const codeHelper = $derived(m.projection_code_helper());
  const resetLabel = $derived(m.projection_code_reset());
  const submitLabel = $derived(m.projection_code_submit());
  const activeCatalogueSelectionId = $derived.by(() => {
    if (!isCatalogueProjectionActive()) {
      return undefined;
    }

    return items.find((item) => item.projectionId === projectionState.selected)
      ?.id;
  });
  const selectedCatalogueUnavailable = $derived(
    isCatalogueProjectionActive() && activeCatalogueSelectionId === undefined
  );

  const viewTabs = $derived.by(() => {
    const tabs = [
      {
        icon: ListIcon,
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

  function handleViewChange(index: number): void {
    requestedTabIndex = customCodeEnabled ? index : 0;
  }

  const isEmpty = () => crsCode.trim().length === 0;

  function onReset() {
    if (isEmpty()) return;
    crsCodeDraft = '';
    onreset?.();
  }

  function onApply() {
    if (isEmpty()) return;
    onapply?.({ code: crsCode.trim() });
  }

  function handleCrsCodeInput(event: CustomEvent<string> | Event): void {
    const detail = (event as CustomEvent<string>).detail;
    if (typeof detail === 'string') {
      crsCodeDraft = detail;
      return;
    }

    crsCodeDraft =
      event.target instanceof HTMLTextAreaElement
        ? event.target.value
        : crsCode;
  }

  function selectCatalogueProjection(item: ProjectionCatalogueItem): void {
    projectionActions.setSelected(item.projectionId);
  }

  function handleCatalogueSelect(
    event: CustomEvent<{
      selectedId: string;
      selectedItem?: ProjectionCatalogueComboItem;
    }>
  ): void {
    const selected = event.detail.selectedItem;
    if (selected) {
      selectCatalogueProjection(selected.item);
    }
  }

  function isCatalogueProjectionActive(): boolean {
    return (
      projectionState.overrideActive === true &&
      projectionState.overrideSource === 'manual' &&
      !projectionState.customCode &&
      !projectionState.activeSuggestionId &&
      !projectionState.suggestionD3Config
    );
  }

  function createProjectionCatalogueItem(
    projection: ProjectionInfo
  ): ProjectionCatalogueItem {
    const shapeFilterId = getProjectionShapeFilterId(projection.shape);

    return {
      id: projection.id,
      projectionId: projection.id,
      title: projection.name,
      tag: getProjectionTag(shapeFilterId),
      shapeFilterId
    };
  }

  function getProjectionTag(
    shapeFilterId: ProjectionShapeFilterId | undefined
  ): string {
    return (
      projectionGroups.find((group) => group.id === shapeFilterId)?.label ?? ''
    );
  }
</script>

<div id="khartis-projection-other-tool">
  <div class="other-proj">
    <ToggleTabs
      items={viewTabs}
      activeIndex={activeTabIndex}
      onchange={handleViewChange}
      className="projection-view-tabs"
      hideInactiveLabel={true}
    />

    {#if !isCodeView}
      <div class="projection-content">
        {#if selectedCatalogueUnavailable}
          <InlineNotification
            kind="warning"
            lowContrast
            hideCloseButton
            title={m.projection_catalog_unavailable_title()}
            subtitle={m.projection_catalog_unavailable_subtitle()}
          />
        {/if}

        <div class="projection-header">
          <p class="projection-helper">{description}</p>
        </div>

        {#if items.length > 0}
          {#key catalogueItemsSignature}
            <ComboBox
              size="sm"
              items={catalogueComboItems}
              selectedId={activeCatalogueSelectionId}
              placeholder={m.projection_catalog_search_placeholder()}
              shouldFilterItem={(comboItem, value) =>
                !value ||
                comboItem.text.toLowerCase().includes(value.toLowerCase())}
              on:select={handleCatalogueSelect}
            />
          {/key}
        {:else}
          <div class="projection-empty-state">
            <p class="projection-empty-title">
              {m.projection_catalog_unavailable_title()}
            </p>
            <p class="projection-empty-subtitle">
              {m.projection_catalog_unavailable_subtitle()}
            </p>
          </div>
        {/if}
      </div>
    {:else}
      <div class="code-view">
        <p class="intro">{codeIntro}</p>
        <div class="code-form">
          <TextArea
            value={crsCode}
            labelText={codeLabel}
            placeholder={codePlaceholder}
            helperText={codeHelper}
            rows={8}
            light={true}
            on:input={handleCrsCodeInput}
          />
          <div class="actions">
            <Button
              kind="tertiary"
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
    width: 100%;
    min-width: 0;
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
    min-height: var(--kh-size-control-md);
  }

  #khartis-projection-other-tool :global(.projection-view-tabs .toggle-icon) {
    width: 16px;
    height: 16px;
  }

  .projection-content {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-04);
    width: 100%;
    min-width: 0;
  }

  .projection-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--cds-spacing-03);
  }

  .projection-helper {
    flex: 1 1 auto;
    min-width: 0;
    margin: 0;
    color: var(--cds-text-secondary, #525252);
    font-size: 0.75rem;
    line-height: 1rem;
    letter-spacing: 0.32px;
  }

  .projection-empty-state {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-02);
    padding: var(--cds-spacing-05);
    border: 1px solid var(--cds-border-subtle-01, #c6c6c6);
    background: var(--cds-layer-01, #f4f4f4);
    color: var(--cds-text-primary, #161616);
  }

  .projection-empty-title,
  .projection-empty-subtitle {
    margin: 0;
  }

  .projection-empty-title {
    font-size: 0.875rem;
    font-weight: 600;
    line-height: 1.125rem;
  }

  .projection-empty-subtitle {
    color: var(--cds-text-secondary, #525252);
    font-size: 0.75rem;
    line-height: 1rem;
  }
</style>
