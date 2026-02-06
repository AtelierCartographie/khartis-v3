<script lang="ts">
  import ColorPicker from '$lib/features/commons/components/color-picker.svelte';
  import ExpandableSection from '$lib/features/commons/components/expandable-section.svelte';
  import ToggleTabs from '$lib/features/commons/components/toggle-tabs.svelte';
  import { LegendTab } from '$lib/features/commons/constants/ui.constants';
  import { hslToHex } from '$lib/features/commons/utils/color-utils';
  import { sanitizeTextInput } from '$lib/features/commons/utils/sanitize.utils';
  import * as m from '$lib/paraglide/messages';
  import {
    Button,
    Column,
    Grid,
    Row,
    Select,
    SelectItem,
    Slider,
    TextInput,
    Toggle
  } from 'carbon-components-svelte';
  import { Document, TextFont, ViewFilled, ViewOff } from 'carbon-icons-svelte';
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

  let localFontFamily = $state('');
  let localFontSize = $state(12);
  let localOpacity = $state(100);

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
    { icon: Document, label: m.legend_content(), iconSize: 20 },
    { icon: TextFont, label: m.legend_style(), iconSize: 20 }
  ]);

  const activeTabIndex = $derived(
    legendState.activeTab === LegendTab.CONTENT ? 0 : 1
  );

  function toggleVisibility(id: string): void {
    const item = items.find((i) => i.id === id);
    if (item) {
      legendActions.updateLegendItem(id, { visible: !item.visible });
    }
  }

  function updateItemField(
    id: string,
    field: keyof LegendItem,
    value: string
  ): void {
    const sanitizedValue = sanitizeTextInput(value);
    legendActions.updateLegendItem(id, { [field]: sanitizedValue });
  }

  function handleTabChange(newIndex: number): void {
    legendActions.setActiveTab(
      newIndex === 0 ? LegendTab.CONTENT : LegendTab.STYLE
    );
  }

  function handleFontFamilyChange(): void {
    if (localFontFamily !== legendState.style.fontFamily) {
      legendActions.updateStyle({ fontFamily: localFontFamily });
    }
  }

  function handleFontSizeChange(): void {
    if (localFontSize !== legendState.style.fontSize) {
      legendActions.updateStyle({ fontSize: localFontSize });
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
    if (localOpacity !== legendState.style.background.opacity) {
      legendActions.updateBackground({ opacity: localOpacity });
    }
  }

  const availableFonts = [
    'Cabin',
    'IBM Plex Sans',
    'Inter',
    'Lato',
    'Open Sans'
  ];
</script>

<div id="khartis-legend-tool">
  <Grid padding noGutter fullWidth>
    <Row>
      <Column>
        <ToggleTabs
          items={tabItems}
          activeIndex={activeTabIndex}
          onChange={handleTabChange}
          className="legend-tabs"
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
          {#snippet icon()}
            <Button
              kind="ghost"
              size="small"
              icon={item.visible ? ViewFilled : ViewOff}
              iconDescription={item.visible ? m.layers_hide() : m.layers_show()}
              onclick={() => toggleVisibility(item.id)}
            />
          {/snippet}

          <Grid padding noGutter>
            <Row>
              <Column>
                <TextInput
                  labelText={m.legend_title()}
                  size="xl"
                  placeholder={item.name}
                  id={`${item.id}-title`}
                  bind:value={item.title}
                  on:change={() =>
                    updateItemField(item.id, 'title', item.title)}
                />
              </Column>
            </Row>

            <Row>
              <Column>
                <TextInput
                  labelText={m.legend_subtitle()}
                  size="xl"
                  placeholder={m.legend_no_subtitle()}
                  id={`${item.id}-subtitle`}
                  bind:value={item.subtitle}
                  on:change={() =>
                    updateItemField(item.id, 'subtitle', item.subtitle)}
                />
              </Column>
            </Row>

            <Row>
              <Column>
                <TextInput
                  labelText={m.legend_note()}
                  size="xl"
                  placeholder={m.legend_no_note()}
                  id={`${item.id}-note`}
                  bind:value={item.note}
                  on:change={() => updateItemField(item.id, 'note', item.note)}
                />
              </Column>
            </Row>
          </Grid>
        </ExpandableSection>
      {/each}
    </div>
  {:else}
    <Grid padding noGutter fullWidth>
      <Row>
        <Column>
          <p class="description">
            {m.legend_common_settings()}
          </p>
        </Column>
      </Row>

      <Row>
        <Column sm={2} md={4} lg={8}>
          <Select
            id="legend-font-select"
            labelText={m.legend_font()}
            bind:selected={localFontFamily}
            on:change={handleFontFamilyChange}
            size="xl"
          >
            {#each availableFonts as f (f)}
              <SelectItem value={f} text={f} />
            {/each}
          </Select>
        </Column>

        <Column sm={2} md={4} lg={8}>
          <Select
            id="legend-font-size"
            labelText={m.legend_font_size()}
            bind:selected={localFontSize}
            on:change={handleFontSizeChange}
            size="xl"
          >
            {#each [10, 11, 12, 14, 16, 18, 20, 24] as s (s)}
              <SelectItem value={s} text={String(s)} />
            {/each}
          </Select>
        </Column>
      </Row>

      <Row>
        <Column>
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
        </Column>
      </Row>

      <div class="divider" style="margin: var(--cds-spacing-05) 0;"></div>

      <Row>
        <Column>
          <Toggle
            labelText={m.legend_background()}
            id="legend-bg-toggle"
            toggled={backgroundEnabled}
            on:toggle={(e) => handleBackgroundEnabledChange(e.detail.toggled)}
          />
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
        <Column sm={3} md={6} lg={13}>
          <div class="slider">
            <Slider
              labelText={m.legend_opacity()}
              min={0}
              max={100}
              step={1}
              bind:value={localOpacity}
              on:change={handleOpacityChange}
              hideTextInput
            />
          </div>
        </Column>

        <Column sm={1} md={2} lg={3}>
          <div class="input-wrapper">
            <input
              id="legend-opacity"
              class="number"
              type="number"
              min={0}
              max={100}
              step={1}
              bind:value={localOpacity}
              onchange={handleOpacityChange}
              inputmode="numeric"
            />
          </div>
        </Column>
      </Row>
    </Grid>
  {/if}
</div>

<style>
  #khartis-legend-tool .expandable-stack :global(.section-container) {
    margin-bottom: 0;
  }

  #khartis-legend-tool
    .expandable-stack
    :global(.section-container + .section-container) {
    border-top: 0;
  }

  .description {
    font-size: 0.875rem;
    color: var(--cds-text-secondary);
    line-height: 1.4;
  }

  .divider {
    height: 1px;
    background: var(--cds-border-subtle);
  }

  .slider {
    width: 100%;
  }

  #khartis-legend-tool .slider :global(.bx--slider) {
    min-width: 200px !important;
  }

  #khartis-legend-tool .slider :global(.bx--slider__track) {
    background: var(--cds-ui-03);
  }

  #khartis-legend-tool .slider :global(.bx--slider__filled-track) {
    background: var(--cds-text-01);
  }

  .input-wrapper {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: flex-end;
  }

  .input-wrapper .number {
    width: 100%;
    height: 32px;
    min-width: unset;
    padding: 0 var(--cds-spacing-03);
    border: none;
    border-bottom: 1px solid var(--cds-border-strong);
    background: var(--cds-ui-02);
    color: var(--cds-text-01);
    font-weight: normal;
    font-family: var(--cds-code-01-font-family);
    line-height: var(--cds-body-short-01-line-height);
    border-radius: 0;
    box-sizing: border-box;
    font-weight: 600;
  }

  .input-wrapper .number:focus {
    outline: none;
    border-bottom-color: var(--cds-border-strong);
  }

  .input-wrapper .number:disabled {
    background: var(--cds-ui-03);
    color: var(--cds-text-02);
    cursor: not-allowed;
  }

  input[type='number']::-webkit-outer-spin-button,
  input[type='number']::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }

  input[type='number'] {
    appearance: textfield;
    -moz-appearance: textfield;
  }
</style>
