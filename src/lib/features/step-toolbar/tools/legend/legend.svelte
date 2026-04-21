<script lang="ts">
  import ColorPicker from '$lib/features/commons/components/color-picker.svelte';
  import ExpandableSection from '$lib/features/commons/components/expandable-section.svelte';
  import SliderWithInput from '$lib/features/commons/components/slider-with-input.svelte';
  import Switch from '$lib/features/commons/components/switch.svelte';
  import ToggleTabs from '$lib/features/commons/components/toggle-tabs.svelte';
  import { LegendTab } from '$lib/features/commons/constants/ui.constants';
  import { visualizationStore } from '$lib/features/commons/store/visualization.store.svelte';
  import { hslToHex } from '$lib/features/commons/utils/color-utils';
  import { sanitizeTextInput } from '$lib/features/commons/utils/sanitize.utils';
  import * as m from '$lib/paraglide/messages';
  import { TableOfContents, TextFont } from 'carbon-icons-svelte';
  import { Select, SelectItem, TextInput } from 'carbon-components-svelte';
  import { onMount } from 'svelte';
  import {
    AVAILABLE_FONTS,
    CSS_CLASSES,
    DOM_IDS,
    LEGEND_DEFAULTS,
    LEGEND_FONT_SIZES
  } from './legend.constants';
  import { getLegendState, legendActions } from './legend.store.svelte';
  import type { LegendItem } from './legend.types';

  type ColorPickerValidateEvent = {
    hex: string;
    hue: number;
    saturation: number;
    lightness: number;
  };

  type LegendItemTextField = 'title' | 'subtitle' | 'note';

  const legendState = $derived(getLegendState());
  const items = $derived(legendState.items);
  const isContentTab = $derived(legendState.activeTab === LegendTab.CONTENT);

  let localFontFamily = $state<string>(AVAILABLE_FONTS[0]);
  let localFontSize = $state<number>(LEGEND_DEFAULTS.FONT_SIZE);
  let localOpacity = $state<number>(LEGEND_DEFAULTS.OPACITY);
  let expandedItemIds = $state<string[]>([]);

  $effect(() => {
    localFontFamily = legendState.style.fontFamily;
    localFontSize = legendState.style.fontSize;
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

  const backgroundEnabled = $derived(legendState.style.background.enabled);
  const bgColor = $derived(legendState.style.background.color);
  const bgHex = $derived(
    hslToHex(bgColor.hue, bgColor.saturation, bgColor.lightness)
  );
  const textColor = $derived(legendState.style.textColor);
  const textColorHex = $derived(
    hslToHex(textColor.hue, textColor.saturation, textColor.lightness)
  );

  $effect(() => {
    void visualizationStore.version;
    legendActions.syncWithVisualizations();
  });

  function updateItemField(
    id: string,
    field: LegendItemTextField,
    value: string
  ): void {
    const sanitizedValue = sanitizeTextInput(value);
    legendActions.updateLegendItem(id, {
      [field]: sanitizedValue,
      ...(field === 'title' ? { titleMode: 'custom' } : {}),
      ...(field === 'subtitle' ? { subtitleMode: 'custom' } : {})
    });
  }

  function getTextInputValue(
    event: CustomEvent<string | number | null>
  ): string {
    return typeof event.detail === 'string'
      ? event.detail
      : event.detail == null
        ? ''
        : String(event.detail);
  }

  function handleTabChange(tab: LegendTab): void {
    if (tab !== legendState.activeTab) {
      legendActions.setActiveTab(tab);
    }
  }

  function handleFontFamilyChange(event: Event): void {
    const nextFontFamily = (event.currentTarget as HTMLSelectElement).value;
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

      expandedItemIds = [...expandedItemIds, id];
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

  function getItemHeaderTitle(item: LegendItem): string {
    const title = item.title.trim();
    return title || item.name;
  }

  onMount(() => {
    legendActions.markAsOpened();
  });
</script>

<div id={DOM_IDS.LEGEND_TOOL} class="legend-tool">
  <div
    class={CSS_CLASSES.LEGEND_TABS}
    role="tablist"
    aria-label={m.tool_legend()}
  >
    <ToggleTabs
      activeIndex={legendState.activeTab === LegendTab.CONTENT ? 0 : 1}
      items={[
        { icon: TableOfContents, label: m.legend_content(), iconSize: 16 },
        { icon: TextFont, label: m.legend_style(), iconSize: 16 }
      ]}
      onChange={(index) =>
        handleTabChange(index === 0 ? LegendTab.CONTENT : LegendTab.STYLE)}
    />
  </div>

  {#if isContentTab}
    <div id="legend-content-panel" class="legend-panel" role="tabpanel">
      <div class="expandable-stack">
        {#each items as item (item.id)}
          <ExpandableSection
            title={getItemHeaderTitle(item)}
            showToggle={true}
            toggleChecked={item.visible}
            open={isItemExpanded(item.id)}
            onToggle={(expanded) => setItemExpanded(item.id, expanded)}
            onToggleChange={(checked) =>
              handleItemVisibilityChange(item, checked)}
          >
            <div class="legend-fields">
              <TextInput
                labelText={m.legend_title()}
                size="xl"
                placeholder={item.name}
                id={`${item.id}-title`}
                value={item.title}
                on:input={(e: CustomEvent<string | number | null>) =>
                  updateItemField(item.id, 'title', getTextInputValue(e))}
              />

              <TextInput
                labelText={m.legend_subtitle()}
                size="sm"
                placeholder={m.legend_no_subtitle()}
                id={`${item.id}-subtitle`}
                value={item.subtitle}
                on:input={(e: CustomEvent<string | number | null>) =>
                  updateItemField(item.id, 'subtitle', getTextInputValue(e))}
              />

              <TextInput
                labelText={m.legend_note()}
                size="sm"
                placeholder={m.legend_no_note()}
                id={`${item.id}-note`}
                value={item.note}
                on:input={(e: CustomEvent<string | number | null>) =>
                  updateItemField(item.id, 'note', getTextInputValue(e))}
              />
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
          <Select
            id={DOM_IDS.FONT_SELECT}
            labelText={m.legend_font()}
            selected={localFontFamily}
            on:change={handleFontFamilyChange}
            size="sm"
          >
            {#each AVAILABLE_FONTS as font (font)}
              <SelectItem value={font} text={font} />
            {/each}
          </Select>
          <Select
            id={DOM_IDS.FONT_SIZE}
            labelText={m.legend_font_size()}
            selected={String(localFontSize)}
            on:change={handleFontSizeChange}
            size="sm"
          >
            {#each LEGEND_FONT_SIZES as size (size)}
              <SelectItem value={String(size)} text={String(size)} />
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

      <div class="legend-background-row">
        <div class="legend-background-toggle">
          <span class="legend-field-label">{m.legend_background()}</span>
          <Switch
            labelText={m.legend_background()}
            hideLabel
            size="sm"
            toggled={backgroundEnabled}
            labelA={m.no()}
            labelB={m.yes()}
            showStateLabel
            onchange={handleBackgroundEnabledChange}
          />
        </div>

        <ColorPicker
          triggerLabel={m.legend_background_color()}
          hex={bgHex}
          hue={bgColor.hue}
          saturation={bgColor.saturation}
          lightness={bgColor.lightness}
          onValidate={({
            hue,
            saturation,
            lightness
          }: ColorPickerValidateEvent) => {
            handleBackgroundColorChange({ hue, saturation, lightness });
          }}
        />
      </div>

      <SliderWithInput
        label={m.legend_opacity()}
        bind:value={localOpacity}
        min={0}
        max={100}
        step={1}
        showMinMax
        minLabel="0"
        maxLabel="100"
        inputWidth="72px"
        showSteppers={false}
        onchange={handleOpacityChange}
      />
    </div>
  {/if}
</div>

<style>
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
    grid-template-columns: minmax(0, 1fr) 10rem;
    gap: var(--cds-spacing-02);
  }

  .legend-background-row {
    display: grid;
    grid-template-columns: minmax(6rem, auto) minmax(0, 1fr);
    gap: var(--cds-spacing-05);
    align-items: end;
  }

  .legend-background-toggle {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-03);
  }

  .legend-field-label {
    font-size: 0.75rem;
    line-height: 1rem;
    letter-spacing: 0.32px;
    color: var(--cds-text-secondary, #525252);
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

  :global(#khartis-legend-tool .legend-background-toggle .kh-switch-native) {
    gap: var(--cds-spacing-03);
  }

  :global(#khartis-legend-tool .bx--text-input) {
    font-size: 0.875rem;
    line-height: 1.125rem;
    letter-spacing: 0.16px;
  }
</style>
