<script lang="ts">
  import FontFamilySelect from '$lib/features/step-toolbar/font-family-select.svelte';
  import SwitchedContent from '$lib/features/commons/components/switched-content.svelte';
  import BackgroundSettings from '$lib/features/commons/components/background-settings.svelte';
  import ColorPicker from '$lib/features/commons/components/color-picker.svelte';
  import ExpandableSection from '$lib/features/commons/components/expandable-section.svelte';
  import SliderWithInput from '$lib/features/commons/components/slider-with-input.svelte';
  import SimpleRadioGroup from '$lib/features/commons/components/simple-radio-group.svelte';
  import Switch from '$lib/features/commons/components/switch.svelte';
  import ToggleTabs from '$lib/features/commons/components/toggle-tabs.svelte';
  import { LegendTab } from '$lib/features/commons/constants/ui.constants';
  import { visualizationStore } from '$lib/features/commons/stores/visualization.store.svelte';
  import { datasetsStore } from '$lib/features/commons/stores/datasets.store.svelte';
  import VariableBadge from '$lib/features/commons/components/variable-badge.svelte';
  import type { VariableBadgeType } from '$lib/features/commons/types/variable-badge.types';
  import { resolveColumnBadgeType } from '$lib/features/commons/utils/variable-badge.utils';
  import { getLegendColumns } from '$lib/features/commons/utils/legend-subtitle.utils';
  import { hslToHex } from '$lib/features/commons/utils/color-utils';
  import { sanitizeTextInput } from '$lib/features/commons/utils/sanitize.utils';
  import * as m from '$lib/paraglide/messages';
  import { TableOfContents, TextFont } from 'carbon-icons-svelte';
  import {
    InlineNotification,
    Select,
    SelectItem,
    TextArea
  } from 'carbon-components-svelte';
  import { onMount, untrack } from 'svelte';
  import {
    CARTOGRAPHIC_FONT_FAMILY,
    clampFontSize,
    normalizeFontFamily,
    resolveFontSizeOptions
  } from '$lib/features/step-toolbar/fonts.constants';
  import { CSS_CLASSES, DOM_IDS, LEGEND_DEFAULTS } from './legend.constants';
  import {
    getComponentLabel,
    getLegendPrimitiveLabel,
    getLegendState,
    legendActions
  } from './legend.store.svelte';
  import {
    clearLegendItemFocus,
    getPendingLegendItemFocus,
    getSelectedLegendItem,
    requestLegendItemCentering
  } from './legend-focus.svelte';
  import {
    resolveLegendItemLayout,
    selectRenderedLegendItems
  } from './legend-items.utils';
  import {
    getRenderedLegendSegments,
    hasNothingToDraw
  } from './legend-rendered-segments.svelte';
  import type { LegendSubtitlePrimitive } from '$lib/features/commons/utils/legend-subtitle.utils';
  import type { LegendItem, LegendItemLayout } from '../../types/legend.types';
  import { getLocale } from '$lib/paraglide/runtime.js';

  type ColorPickerValidateEvent = {
    hex: string;
    hue: number;
    saturation: number;
    lightness: number;
  };

  type LegendItemTextField = 'title' | 'subtitle' | 'note';

  const TEXT_FIELDS: {
    key: LegendItemTextField;
    label: () => string;
    placeholder: () => string;
  }[] = [
    { key: 'title', label: m.legend_title, placeholder: m.legend_title },
    {
      key: 'subtitle',
      label: m.legend_subtitle,
      placeholder: m.legend_no_subtitle
    },
    { key: 'note', label: m.legend_note, placeholder: m.legend_no_note }
  ];
  type LegendSyncInputs = readonly [
    locale: string,
    visualizationVersion: number
  ];

  const legendState = $derived(getLegendState());
  // Only expose the legends that are actually drawn on the map. In a collection
  // the base visualization renders no legend, so listing it here would surface a
  // phantom "Visualisation" entry that edits nothing visible.
  const items = $derived(
    selectRenderedLegendItems(legendState.items).filter(
      (item) => !item.primitive || !hasNothingToDraw(item.id)
    )
  );
  // Without a visualization there is no legend to style: the panel only says
  // to create one first.
  const hasVisualizations = $derived(
    visualizationStore.visualizations.length > 0
  );
  const isContentTab = $derived(
    !hasVisualizations || legendState.activeTab === LegendTab.CONTENT
  );

  let localFontFamily = $state<string>(CARTOGRAPHIC_FONT_FAMILY);
  let localFontSize = $state<number>(LEGEND_DEFAULTS.FONT_SIZE);
  const fontSizeOptions = $derived(resolveFontSizeOptions(localFontSize));
  let localOpacity = $state<number>(LEGEND_DEFAULTS.OPACITY);
  let expandedItemIds = $state<string[]>([]);

  $effect(() => {
    localFontFamily =
      normalizeFontFamily(legendState.style.fontFamily) ??
      CARTOGRAPHIC_FONT_FAMILY;
    localFontSize = clampFontSize(
      legendState.style.fontSize,
      LEGEND_DEFAULTS.FONT_SIZE
    );
    localOpacity = legendState.style.background.opacity;
  });

  $effect(() => {
    const visibleItemIds = new Set(
      items.filter((item) => item.visible).map((item) => item.id)
    );
    const nextExpandedItemIds = expandedItemIds.filter((id) =>
      visibleItemIds.has(id)
    );

    if (nextExpandedItemIds.length === 0 && visibleItemIds.size > 0) {
      const firstExpandedItem = items.find((item) => item.visible);
      if (!firstExpandedItem) {
        return;
      }
      if (expandedItemIds[0] !== firstExpandedItem.id) {
        expandedItemIds = [firstExpandedItem.id];
      }
      return;
    }

    if (
      nextExpandedItemIds.length !== expandedItemIds.length ||
      nextExpandedItemIds.some((id, index) => id !== expandedItemIds[index])
    ) {
      expandedItemIds = nextExpandedItemIds;
    }
  });

  $effect(() => {
    const focusItemId = getPendingLegendItemFocus();
    if (!focusItemId) return;

    untrack(() => {
      clearLegendItemFocus();
      if (!items.some((item) => item.id === focusItemId)) return;
      legendActions.setActiveTab(LegendTab.CONTENT);
      expandedItemIds = [focusItemId];
    });
  });

  const backgroundEnabled = $derived(legendState.style.background.enabled);
  const bgColor = $derived(legendState.style.background.color);
  const textColor = $derived(legendState.style.textColor);
  const textColorHex = $derived(
    hslToHex(textColor.hue, textColor.saturation, textColor.lightness)
  );

  function syncLegendWithCurrentInputs(_inputs: LegendSyncInputs): void {
    legendActions.syncWithVisualizations();
  }

  $effect(() => {
    const syncInputs: LegendSyncInputs = [
      getLocale(),
      visualizationStore.version
    ];
    untrack(() => syncLegendWithCurrentInputs(syncInputs));
  });

  function updateItemField(
    id: string,
    field: LegendItemTextField,
    value: string
  ): void {
    const sanitizedValue = sanitizeTextInput(value, { trim: false });
    legendActions.updateLegendItem(id, {
      [field]: sanitizedValue,
      ...(field === 'title' ? { titleMode: 'custom' } : {}),
      ...(field === 'subtitle' ? { subtitleMode: 'custom' } : {})
    });
  }

  function getTextAreaValue(event: Event): string {
    const target = event.target;
    return target instanceof HTMLTextAreaElement ? target.value : '';
  }

  function handleTabChange(tab: LegendTab): void {
    if (tab !== legendState.activeTab) {
      legendActions.setActiveTab(tab);
    }
  }

  function handleFontFamilyChange(nextFontFamily: string): void {
    localFontFamily = nextFontFamily;

    if (nextFontFamily !== legendState.style.fontFamily) {
      legendActions.updateStyle({ fontFamily: nextFontFamily });
    }
  }

  function handleFontSizeChange(event: Event): void {
    const nextFontSize = Number(
      (event.currentTarget as HTMLSelectElement).value
    );
    if (!Number.isFinite(nextFontSize)) {
      return;
    }

    localFontSize = nextFontSize;

    if (nextFontSize !== legendState.style.fontSize) {
      legendActions.updateStyle({ fontSize: nextFontSize });
    }
  }

  function handleTextColorChange(color: {
    hue: number;
    saturation: number;
    lightness: number;
  }): void {
    legendActions.updateStyle({ textColor: color });
  }

  function handleBackgroundEnabledChange(enabled: boolean): void {
    legendActions.updateBackground({ enabled });
  }

  function handleBackgroundColorChange(color: {
    hue: number;
    saturation: number;
    lightness: number;
  }): void {
    legendActions.updateBackground({ color });
  }

  function handleOpacityChange(nextOpacity: number): void {
    localOpacity = nextOpacity;
    const normalizedOpacity = Math.max(
      0,
      Math.min(100, Math.round(nextOpacity))
    );
    localOpacity = normalizedOpacity;

    if (normalizedOpacity !== legendState.style.background.opacity) {
      legendActions.updateBackground({ opacity: normalizedOpacity });
    }
  }

  function isItemExpanded(id: string): boolean {
    return expandedItemIds.includes(id);
  }

  function setItemExpanded(id: string, expanded: boolean): void {
    if (expanded) {
      if (isItemExpanded(id)) {
        return;
      }

      expandedItemIds = [id];
      return;
    }

    if (!isItemExpanded(id)) {
      return;
    }

    expandedItemIds = expandedItemIds.filter((itemId) => itemId !== id);
  }

  function handleItemVisibilityChange(
    item: LegendItem,
    visible: boolean
  ): void {
    legendActions.updateLegendItem(item.id, { visible });

    if (!visible) {
      setItemExpanded(item.id, false);
      return;
    }

    setItemExpanded(item.id, true);
  }

  const ENTRY_LABEL_PLACEHOLDERS: Record<
    LegendSubtitlePrimitive,
    () => string
  > = {
    area: m.polygons_title,
    point: m.symbols_title,
    line: m.lines_title,
    text: m.texts_title
  };

  function updateItemLayout(item: LegendItem, updates: LegendItemLayout): void {
    legendActions.updateLegendItemLayout(item.id, updates);
  }

  function handleTitleAlignChange(item: LegendItem, event: Event): void {
    const value = (event.currentTarget as HTMLSelectElement).value;
    if (value === 'start' || value === 'center' || value === 'end') {
      updateItemLayout(item, { titleAlign: value });
    }
  }

  function updateEntryLabel(item: LegendItem, value: string): void {
    legendActions.updateLegendItem(item.id, {
      entryLabel: sanitizeTextInput(value, { trim: false })
    });
  }

  interface LegendItemHeader {
    variables: { name: string; type: VariableBadgeType }[];
    /** Shown instead of the badges when the legend reads no column. */
    fallback: string;
    path: string[];
  }

  function getItemHeader(item: LegendItem): LegendItemHeader | null {
    if (!item.primitive) return null;
    const visualization = visualizationStore.visualizations.find(
      (viz) => viz.id === item.variableId
    );
    if (!visualization) return null;

    const columns =
      datasetsStore
        .getAllDatasets()
        .find((dataset) => dataset.id === visualization.datasetId)?.columns ??
      [];
    const path = [getLegendPrimitiveLabel(item.primitive)];
    if (item.component) {
      const component = getComponentLabel(item.primitive, item.component);
      path.push(
        component.charAt(0).toLocaleUpperCase(getLocale()) + component.slice(1)
      );
    }

    return {
      variables: getLegendColumns(
        visualization,
        item.primitive,
        item.component
      ).map((name) => ({
        name,
        type: resolveColumnBadgeType(columns, name)
      })),
      fallback: visualization.name,
      path
    };
  }

  function handleItemExpandedChange(item: LegendItem, expanded: boolean): void {
    setItemExpanded(item.id, expanded);
    if (expanded) {
      requestLegendItemCentering(item.id);
    }
  }

  function getItemHeaderTitle(item: LegendItem): string {
    if (item.primitive) {
      return item.name;
    }

    return item.title.trim() || item.name;
  }

  onMount(() => {
    legendActions.markAsOpened();
  });
</script>

<div id={DOM_IDS.LEGEND_TOOL} class="legend-tool">
  <p class="kh-help">{m.styling_drag_helper()}</p>

  <div
    class={CSS_CLASSES.LEGEND_TABS}
    role="tablist"
    aria-label={m.tool_legend()}
  >
    <ToggleTabs
      size="md"
      activeIndex={isContentTab ? 0 : 1}
      items={[
        { icon: TableOfContents, label: m.legend_content(), iconSize: 16 },
        {
          icon: TextFont,
          label: m.legend_style(),
          iconSize: 16,
          disabled: !hasVisualizations
        }
      ]}
      onchange={(index) =>
        handleTabChange(index === 0 ? LegendTab.CONTENT : LegendTab.STYLE)}
    />
  </div>

  <SwitchedContent value={isContentTab}>
    {#if isContentTab}
      <div id="legend-content-panel" class="legend-panel" role="tabpanel">
        {#if !hasVisualizations}
          <div class="kh-notification-stack legend-empty-notice">
            <InlineNotification
              kind="info"
              lowContrast
              hideCloseButton
              subtitle={m.legend_no_visualization()}
            />
          </div>
        {/if}
        <div class="expandable-stack">
          {#each items as item (item.id)}
            {@const segments = getRenderedLegendSegments(item.id)}
            {@const layout = resolveLegendItemLayout(item)}
            {@const header = getItemHeader(item)}
            <ExpandableSection
              title={getItemHeaderTitle(item)}
              titleClass={item.id === getSelectedLegendItem()
                ? 'legend-item-title legend-item-title--selected'
                : 'legend-item-title'}
              showToggle={true}
              toggleChecked={item.visible}
              open={isItemExpanded(item.id)}
              scrollIntoViewOnOpen
              onToggle={(expanded) => handleItemExpandedChange(item, expanded)}
              onToggleChange={(checked) =>
                handleItemVisibilityChange(item, checked)}
            >
              {#snippet titleContent()}
                {#if header}
                  <span class="legend-item-heading">
                    {#each header.variables as variable (variable.name)}
                      <VariableBadge
                        label={variable.name}
                        type={variable.type}
                        interactive={false}
                        showTypeIcon={false}
                      />
                    {:else}
                      <span class="legend-item-heading__name">
                        {header.fallback}
                      </span>
                    {/each}
                    {#each header.path as step (step)}
                      <span
                        class="legend-item-heading__step"
                        aria-hidden="true"
                      >
                        &gt;
                      </span>
                      <span>{step}</span>
                    {/each}
                  </span>
                {:else}
                  {getItemHeaderTitle(item)}
                {/if}
              {/snippet}
              <div class="legend-fields">
                {#each TEXT_FIELDS as field (field.key)}
                  <TextArea
                    labelText={field.label()}
                    placeholder={field.placeholder()}
                    id={`${item.id}-${field.key}`}
                    rows={Math.max(1, item[field.key].split('\n').length)}
                    value={item[field.key]}
                    on:input={(e: Event) =>
                      updateItemField(item.id, field.key, getTextAreaValue(e))}
                  />
                {/each}

                <div class="legend-layout-group">
                  <div class="legend-switch-row">
                    <span class="legend-field-label">
                      {m.legend_title_side()}
                    </span>
                    <Switch
                      labelText={m.legend_title_side()}
                      hideLabel
                      size="sm"
                      toggled={layout.titleSide}
                      labelA={m.no()}
                      labelB={m.yes()}
                      showStateLabel
                      onchange={(toggled) =>
                        updateItemLayout(item, { titleSide: toggled })}
                    />
                  </div>
                  {#if layout.titleSide}
                    <Select
                      id={`${item.id}-title-align`}
                      labelText={m.legend_title_align()}
                      selected={layout.titleAlign}
                      size="sm"
                      on:change={(event: Event) =>
                        handleTitleAlignChange(item, event)}
                    >
                      <SelectItem
                        value="start"
                        text={m.legend_title_align_start()}
                      />
                      <SelectItem
                        value="center"
                        text={m.legend_title_align_center()}
                      />
                      <SelectItem
                        value="end"
                        text={m.legend_title_align_end()}
                      />
                    </Select>
                  {/if}
                </div>

                {#if item.primitive && segments.some((segment) => segment.kind === 'unique')}
                  <TextArea
                    labelText={m.legend_entry_label()}
                    placeholder={ENTRY_LABEL_PLACEHOLDERS[item.primitive]()}
                    id={`${item.id}-entry-label`}
                    rows={1}
                    value={item.entryLabel ?? ''}
                    on:input={(e: Event) =>
                      updateEntryLabel(item, getTextAreaValue(e))}
                  />
                {/if}

                {#if segments.some((segment) => segment.kind === 'class-bar')}
                  <div class="legend-layout-group">
                    <SimpleRadioGroup
                      name={`${item.id}-orientation`}
                      legendText={m.legend_layout()}
                      items={[
                        {
                          value: 'horizontal',
                          labelText: m.legend_orientation_horizontal()
                        },
                        {
                          value: 'vertical',
                          labelText: m.legend_orientation_vertical()
                        }
                      ]}
                      selected={layout.classBarOrientation === 'vertical'
                        ? 'vertical'
                        : 'horizontal'}
                      onchange={(orientation) =>
                        updateItemLayout(item, {
                          classBarOrientation:
                            orientation === 'vertical'
                              ? 'vertical'
                              : 'horizontal'
                        })}
                    />
                    {#if layout.classBarOrientation === 'vertical'}
                      <SimpleRadioGroup
                        name={`${item.id}-order`}
                        legendText={m.legend_order()}
                        items={[
                          {
                            value: 'ascending',
                            labelText: m.legend_order_ascending()
                          },
                          {
                            value: 'descending',
                            labelText: m.legend_order_descending()
                          }
                        ]}
                        selected={layout.lowAtBottom
                          ? 'descending'
                          : 'ascending'}
                        onchange={(order) =>
                          updateItemLayout(item, {
                            lowAtBottom: order === 'descending'
                          })}
                      />
                    {/if}
                    <div class="legend-switch-row">
                      <span class="legend-field-label">
                        {m.legend_proportional_classes()}
                      </span>
                      <Switch
                        labelText={m.legend_proportional_classes()}
                        hideLabel
                        size="sm"
                        toggled={layout.proportionalClasses}
                        labelA={m.no()}
                        labelB={m.yes()}
                        showStateLabel
                        onchange={(toggled) =>
                          updateItemLayout(item, {
                            proportionalClasses: toggled
                          })}
                      />
                    </div>
                  </div>
                {/if}

                {#if segments.some((segment) => segment.kind === 'entries')}
                  <SliderWithInput
                    label={m.legend_entry_spacing()}
                    value={Math.round(layout.entrySpacing * 100)}
                    min={0}
                    max={100}
                    step={5}
                    inputWidth="72px"
                    onchange={(value) =>
                      updateItemLayout(item, { entrySpacing: value })}
                  />
                {/if}
              </div>
            </ExpandableSection>
          {/each}
        </div>
      </div>
    {:else}
      <div
        id="legend-style-panel"
        class="legend-panel legend-style-panel"
        role="tabpanel"
      >
        <p class="legend-description">{m.legend_common_settings()}</p>

        <div class="legend-style-section">
          <div class="legend-text-style-row">
            <FontFamilySelect
              id={DOM_IDS.FONT_SELECT}
              labelText={m.legend_font()}
              value={localFontFamily}
              fallback={CARTOGRAPHIC_FONT_FAMILY}
              onchange={handleFontFamilyChange}
            />
            <Select
              id={DOM_IDS.FONT_SIZE}
              labelText={m.legend_font_size()}
              selected={String(localFontSize)}
              on:change={handleFontSizeChange}
              size="sm"
            >
              {#each fontSizeOptions as sizeOption (sizeOption)}
                <SelectItem value={sizeOption} text={sizeOption} />
              {/each}
            </Select>
          </div>

          <ColorPicker
            triggerLabel={m.legend_text_color()}
            hex={textColorHex}
            hue={textColor.hue}
            saturation={textColor.saturation}
            lightness={textColor.lightness}
            onValidate={({
              hue,
              saturation,
              lightness
            }: ColorPickerValidateEvent) => {
              handleTextColorChange({ hue, saturation, lightness });
            }}
          />
        </div>

        <div class="legend-divider"></div>

        <BackgroundSettings
          enabled={backgroundEnabled}
          color={bgColor}
          opacity={localOpacity}
          shadow={legendState.style.background.shadow}
          onEnabledChange={handleBackgroundEnabledChange}
          onColorChange={handleBackgroundColorChange}
          onOpacityChange={handleOpacityChange}
          onShadowChange={(shadow) =>
            legendActions.updateBackground({ shadow })}
        />
      </div>
    {/if}
  </SwitchedContent>
</div>

<style>
  /* One title line is as tall as a variable badge. A title on two lines gets
     the vertical margins a one-line title has inside the header height. */
  #khartis-legend-tool {
    --legend-title-line: 18px;
  }

  #khartis-legend-tool :global(.section-expand-btn) {
    padding-block: calc((var(--kh-size-lg) - var(--legend-title-line)) / 2);
  }

  :global(.section-title.legend-item-title) {
    font-size: 0.8125rem;
    line-height: var(--legend-title-line);
    font-weight: 600;
    min-width: 0;
  }

  :global(.section-title.legend-item-title--selected) {
    font-weight: 700;
  }

  .legend-item-heading {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    overflow: hidden;
    min-width: 0;
    line-height: var(--legend-title-line);
    overflow-wrap: anywhere;
  }

  .legend-item-heading :global(.variable-badge) {
    display: inline-flex;
    vertical-align: top;
    min-width: 0;
    max-width: 100%;
    margin-inline-end: var(--cds-spacing-02);
    cursor: inherit;
  }

  #khartis-legend-tool .legend-item-heading :global(.badge-label) {
    padding: 0 8px;
    font-weight: 400;
  }

  #khartis-legend-tool
    :global(.legend-item-title--selected .legend-item-heading .badge-label) {
    font-weight: 600;
  }

  .legend-item-heading__step {
    color: var(--cds-text-secondary);
    margin-inline: var(--cds-spacing-02);
  }

  .legend-tool {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-03);
  }

  .legend-panel {
    width: 100%;
  }

  .legend-fields {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-05);
    width: 100%;
  }

  .legend-style-panel {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-05);
  }

  .legend-style-section {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-05);
  }

  .legend-description {
    margin: 0;
    font-size: 0.875rem;
    line-height: 1.25rem;
    color: var(--cds-text-secondary, #525252);
  }

  .legend-text-style-row {
    display: grid;
    grid-template-columns:
      minmax(0, 1fr)
      var(--kh-text-size-control-width, 80px);
    gap: var(--cds-spacing-02);
  }

  @media (max-width: 480px) {
    .legend-text-style-row {
      grid-template-columns: 1fr;
    }
  }

  .legend-field-label {
    font-size: 0.75rem;
    line-height: 1rem;
    letter-spacing: 0.32px;
    color: var(--cds-text-secondary, #525252);
  }

  .legend-layout-group {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-03);
  }

  .legend-switch-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--cds-spacing-03);
  }

  .legend-divider {
    height: 1px;
    background: var(--cds-border-subtle-01, #c6c6c6);
  }

  :global(#khartis-legend-tool .bx--form-item) {
    margin-bottom: 0;
  }

  :global(#khartis-legend-tool .bx--label) {
    margin-bottom: 8px;
  }

  :global(#khartis-legend-tool .bx--text-area) {
    min-height: 0;
    resize: vertical;
  }

  :global(#khartis-legend-tool .bx--text-input),
  :global(#khartis-legend-tool .bx--text-area) {
    font-size: 0.875rem;
    line-height: 1.125rem;
    letter-spacing: 0.16px;
  }
</style>
