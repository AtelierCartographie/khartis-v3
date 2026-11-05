<script lang="ts">
  import ToggleTabs from '$lib/features/commons/components/toggle-tabs.svelte';
  import {
    basemapService,
    hasPendingWorkerParse,
    mapLoadingStore
  } from '$lib/features/map';
  import {
    getAvailableProjectionIds,
    supportsCustomProjectionCode
  } from '$lib/features/map/utils/projection-availability.utils';
  import { m } from '$lib/paraglide/messages';
  import { translateCarbonId } from '$lib/features/commons/utils/carbon-a11y.utils';
  import {
    Button,
    ComboBox,
    InlineLoading,
    InlineNotification,
    TextArea
  } from 'carbon-components-svelte';
  import {
    CheckmarkOutline,
    Code,
    List as ListIcon
  } from 'carbon-icons-svelte';
  import {
    getProjectionById,
    type ProjectionInfo,
    PROJECTIONS as PROJECTION_CATALOG
  } from '$lib/features/commons/utils/projection.utils';
  import { getCompositeProjectionSelectionId } from '$lib/features/map/utils/user-projection.utils';
  import {
    getProjectionAvailabilityContext,
    getProjectionCodeCoverageBbox,
    getProjectionState,
    projectionActions
  } from './projection.store.svelte';
  import {
    diagnoseProjectionCode,
    type ProjectionCodeDiagnosis
  } from './projection-code.utils';
  import {
    formatProjectionCodeCrs,
    getPresetOfficialProjectionName,
    getProjectionCodeDisplayName,
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
    onapply?: (diagnosis: ProjectionCodeDiagnosis) => void;
    onreset?: () => void;
  };

  let { onapply, onreset }: Props = $props();

  let requestedTabIndex = $state(0);
  let crsCodeDraft = $state<string | null>(null);

  const projectionState = $derived(getProjectionState());
  const crsCode = $derived(crsCodeDraft ?? projectionState.customCode ?? '');
  const projectionContext = $derived(getProjectionAvailabilityContext());
  const customCodeEnabled = $derived(
    supportsCustomProjectionCode(projectionContext)
  );
  const isCodeView = $derived(requestedTabIndex === 1);
  const diagnosis = $derived(
    isCodeView && customCodeEnabled
      ? diagnoseProjectionCode(crsCode, getProjectionCodeCoverageBbox())
      : ({ status: 'empty' } as ProjectionCodeDiagnosis)
  );
  const canApply = $derived(
    diagnosis.status === 'catalogue-equivalent' ||
      (diagnosis.status === 'valid' && diagnosis.coverage !== 'none')
  );
  const isDiagnosisApplied = $derived.by(() => {
    if (diagnosis.status === 'valid') {
      return projectionState.customCode === diagnosis.normalizedCode;
    }
    if (diagnosis.status === 'catalogue-equivalent') {
      return (
        projectionState.overrideActive === true &&
        !projectionState.customCode &&
        !projectionState.suggestionD3Config &&
        projectionState.selected === diagnosis.catalogueId
      );
    }
    return false;
  });
  const isMapReprojecting = $derived(
    mapLoadingStore.isPreparingLayers || hasPendingWorkerParse()
  );
  const diagnosisError = $derived.by((): string | undefined => {
    switch (diagnosis.status) {
      case 'unrecognized':
        return m.projection_code_unrecognized();
      case 'unknown-authority-code':
        return m.projection_code_unknown_authority({ code: diagnosis.code });
      case 'unsupported-method':
        return m.projection_code_unsupported_method({
          method: diagnosis.method ?? '?'
        });
      case 'invalid':
        return m.projection_code_invalid();
      case 'valid':
        return diagnosis.coverage === 'none'
          ? m.projection_code_coverage_none()
          : undefined;
      default:
        return undefined;
    }
  });
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
    },
    // Any other catalog preset (e.g. the single-frame masks of the national
    // basemaps: BRESIL_ALBERS, ALLEMAGNE_UTM32, CANADA_LAMBERT), named by the
    // preset itself; availability keeps it to its own basemap.
    ...Object.keys(basemapService.projectionPresets ?? {})
      .filter(
        (presetId) =>
          !['FRANCE_DOM_TOM', 'EUROPE_DOM_TOM', 'USA_ALBERS'].includes(presetId)
      )
      .map((presetId) => ({
        id: getCompositeProjectionSelectionId(presetId),
        projectionId: getCompositeProjectionSelectionId(presetId),
        title:
          getPresetOfficialProjectionName(
            presetId,
            basemapService.projectionPresets
          ) ?? presetId,
        tag: m.projection_group_rectangular(),
        shapeFilterId: 'Rectangulaire' as ProjectionShapeFilterId
      }))
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

  const viewTabs = $derived([
    { icon: ListIcon, label: catalogueLabel, iconSize: 16 },
    { icon: Code, label: viewCodeLabel, iconSize: 16 }
  ]);

  function handleViewChange(index: number): void {
    requestedTabIndex = index;
  }

  const isEmpty = () => crsCode.trim().length === 0;

  function onReset() {
    if (isEmpty()) return;
    crsCodeDraft = '';
    onreset?.();
  }

  function onApply() {
    if (!canApply) return;
    onapply?.(diagnosis);
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
      activeIndex={requestedTabIndex}
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
              translateWithId={translateCarbonId}
              translateWithIdSelection={translateCarbonId}
              size="sm"
              items={catalogueComboItems}
              selectedId={activeCatalogueSelectionId}
              labelText={catalogueLabel}
              hideLabel
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
    {:else if !customCodeEnabled}
      <InlineNotification
        kind="info"
        lowContrast
        hideCloseButton
        title=""
        subtitle={m.projection_code_unavailable_tiled()}
      />
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
          <div class="code-status" role="status" aria-live="polite">
            {#if diagnosis.status === 'valid'}
              {#if isDiagnosisApplied}
                <InlineLoading
                  status={isMapReprojecting ? 'active' : 'finished'}
                  description={isMapReprojecting
                    ? m.projection_code_status_computing()
                    : m.projection_code_status_applied()}
                />
              {:else if diagnosis.coverage !== 'none'}
                <p class="code-status-recognized">
                  <CheckmarkOutline size={16} />
                  {m.projection_code_status_recognized()}
                </p>
              {/if}
              <p class="code-crs-name">
                {getProjectionCodeDisplayName(crsCode, diagnosis.crs)}
              </p>
              <p class="code-crs-details">
                {formatProjectionCodeCrs(diagnosis.crs)}
              </p>
              {#if diagnosis.coverage === 'partial'}
                <InlineNotification
                  kind="warning"
                  lowContrast
                  hideCloseButton
                  title=""
                  subtitle={m.projection_code_coverage_partial()}
                />
              {/if}
            {:else if diagnosis.status === 'catalogue-equivalent'}
              {#if isDiagnosisApplied}
                <InlineLoading
                  status={isMapReprojecting ? 'active' : 'finished'}
                  description={isMapReprojecting
                    ? m.projection_code_status_computing()
                    : m.projection_code_status_applied()}
                />
              {/if}
              <InlineNotification
                kind="info"
                lowContrast
                hideCloseButton
                title=""
                subtitle={m.projection_code_catalogue_equivalent({
                  method: diagnosis.method,
                  name:
                    getProjectionById(diagnosis.catalogueId)?.name ??
                    diagnosis.catalogueId
                })}
              />
            {/if}
            {#if diagnosisError}
              <InlineNotification
                kind="error"
                lowContrast
                hideCloseButton
                title=""
                subtitle={diagnosisError}
              />
            {/if}
          </div>
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
              disabled={!canApply || isDiagnosisApplied}
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

    .code-status {
      display: flex;
      flex-direction: column;
      gap: var(--cds-spacing-02);
      min-width: 0;

      p {
        margin: 0;
        overflow-wrap: anywhere;
      }

      :global(.bx--inline-notification) {
        margin: 0;
        max-width: 100%;
      }
    }

    .code-status-recognized {
      display: flex;
      align-items: center;
      gap: var(--cds-spacing-02);
      color: var(--cds-support-success, #24a148);
      font-size: 0.75rem;
    }

    .code-crs-name {
      color: var(--cds-text-primary, #161616);
      font-size: 0.875rem;
      font-weight: 600;
    }

    .code-crs-details {
      color: var(--cds-text-secondary, #525252);
      font-size: 0.75rem;
      line-height: 1rem;
    }

    .actions {
      display: flex;
      gap: var(--kh-gap-inline);
      justify-content: flex-end;

      /* Carbon reserves 60px of right padding for an icon these buttons
         don't have, which overflows the tool panel's narrow column. */
      :global(.bx--btn) {
        flex: 0 1 auto;
        min-width: 0;
        padding-right: var(--kh-gap-param);
      }
    }
  }

  #khartis-projection-other-tool :global(.projection-view-tabs) {
    margin-bottom: var(--cds-spacing-03);
  }

  #khartis-projection-other-tool :global(.projection-view-tabs .toggle-tab) {
    font-size: 0.875rem;
    padding-block: 6px;
    min-height: var(--kh-size-sm);
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
