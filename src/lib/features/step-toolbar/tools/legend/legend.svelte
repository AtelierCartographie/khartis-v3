<script lang="ts">
  import ColorPicker from '$lib/features/commons/components/color-picker.svelte';
  import ExpandableSection from '$lib/features/commons/components/expandable-section.svelte';
  import Switch from '$lib/features/commons/components/switch.svelte';
  import ToggleTabs from '$lib/features/commons/components/toggle-tabs.svelte';
  import { LegendTab } from '$lib/features/commons/constants/ui.constants';
  import { visualizationStore } from '$lib/features/commons/store/visualization.store.svelte';
  import { hslToHex } from '$lib/features/commons/utils/color-utils';
  import { sanitizeTextInput } from '$lib/features/commons/utils/sanitize.utils';
  import * as m from '$lib/paraglide/messages';
  import {
    Column,
    Grid,
    Row,
    Select,
    SelectItem,
    Slider,
    TextInput
  } from 'carbon-components-svelte';
  import { TableOfContents, TextFont } from 'carbon-icons-svelte';
  import { onMount } from 'svelte';
  import {
    LEGEND_DEFAULTS,
    LEGEND_FONT_SIZES,
    AVAILABLE_FONTS,
    DOM_IDS,
    CSS_CLASSES
  } from './legend.constants';
  import { getLegendState, legendActions } from './legend.store.svelte';
  import type { LegendItem } from './legend.types';

  type ColorPickerValidateEvent = {
    hex: string;
    hue: number;
    saturation: number;
    lightness: number;
  };

  const legendState = $derived(getLegendState());
  const items = $derived(legendState.items);

  let localFontFamily = $state<string>(AVAILABLE_FONTS[0]);
  let localFontSize = $state<number>(LEGEND_DEFAULTS.FONT_SIZE);
  let localOpacity = $state<number>(LEGEND_DEFAULTS.OPACITY);

  $effect(() => {
    localFontFamily = legendState.style.fontFamily;
    localFontSize = legendState.style.fontSize;
    localOpacity = legendState.style.background.opacity;
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

  const tabItems = $derived([
    { icon: TableOfContents, label: m.legend_content(), iconSize: 16 },
    { icon: TextFont, label: m.legend_style(), iconSize: 16 }
  ]);

  $effect(() => {
    void visualizationStore.version;
    legendActions.syncWithVisualizations();
  });

  const activeTabIndex = $derived(
    legendState.activeTab === LegendTab.CONTENT ? 0 : 1
  );
  function updateItemField(
    id: string,
    field: keyof LegendItem,
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

  function handleTabChange(newIndex: number): void {
    legendActions.setActiveTab(
      newIndex === 0 ? LegendTab.CONTENT : LegendTab.STYLE
    );
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

  function handleOpacityChange(): void {
    const normalizedOpacity = Math.max(
      0,
      Math.min(100, Math.round(localOpacity))
    );
    localOpacity = normalizedOpacity;

    if (normalizedOpacity !== legendState.style.background.opacity) {
      legendActions.updateBackground({ opacity: normalizedOpacity });
    }
  }

  onMount(() => {
    legendActions.markAsOpened();
  });
</script>

<div id={DOM_IDS.LEGEND_TOOL}>
  <Grid noGutter fullWidth>
    <Row>
      <Column>
        <ToggleTabs
          items={tabItems}
          activeIndex={activeTabIndex}
          onChange={handleTabChange}
          className={CSS_CLASSES.LEGEND_TABS}
          activeClass="active"
          fullWidthClass="full-width"
        />
      </Column>
    </Row>
  </Grid>

  {#if activeTabIndex === 0}
    <div class="expandable-stack">
      {#each items as item, index (item.id)}
        <ExpandableSection title={item.name} defaultOpen={index === 0}>
          <Grid noGutter>
            <Row>
              <Column>
                <TextInput
                  labelText={m.legend_title()}
                  size="xl"
                  placeholder={item.name}
                  id={`${item.id}-title`}
                  value={item.title}
                  on:input={(e: CustomEvent<string | number | null>) =>
                    updateItemField(item.id, 'title', getTextInputValue(e))}
                />
              </Column>
            </Row>

            <Row>
              <Column>
                <TextInput
                  labelText={m.legend_subtitle()}
                  size="sm"
                  placeholder={m.legend_no_subtitle()}
                  id={`${item.id}-subtitle`}
                  value={item.subtitle}
                  on:input={(e: CustomEvent<string | number | null>) =>
                    updateItemField(item.id, 'subtitle', getTextInputValue(e))}
                />
              </Column>
            </Row>

            <Row>
              <Column>
                <TextInput
                  labelText={m.legend_note()}
                  size="sm"
                  placeholder={m.legend_no_note()}
                  id={`${item.id}-note`}
                  value={item.note}
                  on:input={(e: CustomEvent<string | number | null>) =>
                    updateItemField(item.id, 'note', getTextInputValue(e))}
                />
              </Column>
            </Row>
          </Grid>
        </ExpandableSection>
      {/each}
    </div>
  {:else}
    <Grid noGutter fullWidth>
      <Row>
        <Column>
          <p class="description">
            {m.legend_common_settings()}
          </p>
        </Column>
      </Row>

      <Row>
        <Column>
          <div class="text-style-row">
            <div class="text-style-font">
              <Select
                id={DOM_IDS.FONT_SELECT}
                labelText={m.legend_font()}
                selected={localFontFamily}
                on:change={handleFontFamilyChange}
                size="sm"
              >
                {#each AVAILABLE_FONTS as f (f)}
                  <SelectItem value={f} text={f} />
                {/each}
              </Select>
            </div>
            <div class="text-style-size">
              <Select
                id={DOM_IDS.FONT_SIZE}
                labelText={m.legend_font_size()}
                selected={String(localFontSize)}
                on:change={handleFontSizeChange}
                size="sm"
              >
                {#each LEGEND_FONT_SIZES as s (s)}
                  <SelectItem value={String(s)} text={String(s)} />
                {/each}
              </Select>
            </div>
            <div class="text-style-color">
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
          </div>
        </Column>
      </Row>

      <div class="divider" style="margin: var(--cds-spacing-05) 0;"></div>

      <Row>
        <Column>
          <div class="switch-row">
            <span class="switch-label">{m.legend_background()}</span>
            <Switch
              labelText={m.legend_background()}
              hideLabel
              toggled={backgroundEnabled}
              labelA={m.no()}
              labelB={m.yes()}
              showStateLabel
              onchange={handleBackgroundEnabledChange}
            />
          </div>
        </Column>

        <Column>
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
        </Column>
      </Row>

      <Row>
        <Column>
          <Slider
            labelText={m.legend_opacity()}
            min={0}
            max={100}
            step={1}
            bind:value={localOpacity}
            on:change={handleOpacityChange}
            minLabel=""
            maxLabel=""
          />
        </Column>
      </Row>
    </Grid>
  {/if}
</div>

<style>
  :global(#khartis-legend-tool .expandable-stack .section-container) {
    margin-bottom: 0;
  }

  :global(
    #khartis-legend-tool
      .expandable-stack
      .section-container
      + .section-container
  ) {
    border-top: 0;
  }

  .description {
    font-size: 0.875rem;
    color: var(--cds-text-secondary);
    line-height: 1.4;
  }

  .switch-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--cds-spacing-04);
    padding: var(--cds-spacing-02) 0;
  }

  .switch-label {
    font-size: 0.75rem;
    color: var(--cds-text-secondary);
    font-weight: 400;
    letter-spacing: 0.32px;
  }

  .divider {
    height: 1px;
    background: var(--cds-border-subtle);
  }

  .text-style-row {
    display: flex;
    align-items: flex-end;
    gap: var(--cds-spacing-02);
  }

  .text-style-font {
    flex: 1;
    min-width: 0;
  }

  .text-style-size {
    width: 80px;
    flex-shrink: 0;
  }

  .text-style-color {
    flex-shrink: 0;
    padding-bottom: 1px;
  }

  .text-style-color :global(#khartis-color-picker .color-trigger) {
    width: 3.5rem;
    min-width: 3.5rem;
    justify-content: space-between;
    gap: var(--cds-spacing-02);
    margin-top: var(--cds-spacing-03);
    padding: 0 var(--cds-spacing-03);
    border: 1px solid var(--cds-border-strong, #8d8d8d);
    border-radius: 999px;
    background: var(--cds-ui-01, #ffffff);
    box-shadow: inset 0 0 0 1px var(--cds-border-subtle, #e0e0e0);
  }

  .text-style-color :global(#khartis-color-picker .swatch) {
    width: 1rem;
    height: 1rem;
    margin-right: 0;
    border-radius: 999px;
    border-color: var(--cds-border-strong, #8d8d8d);
  }

  .text-style-color :global(#khartis-color-picker .chevron) {
    position: static;
    display: flex;
    align-items: center;
    color: var(--cds-icon-secondary, #525252);
  }
</style>
