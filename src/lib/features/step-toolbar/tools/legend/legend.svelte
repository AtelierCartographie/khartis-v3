<script lang="ts">
  import ColorPicker from '$lib/features/commons/components/color-picker.svelte';
  import ExpandableSection from '$lib/features/commons/components/expandable-section.svelte';
  import ToggleTabs from '$lib/features/commons/components/toggle-tabs.svelte';
  import { hslToHex } from '$lib/features/commons/utils/color-utils';
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

  $effect(() => {
    if (localFontFamily && localFontFamily !== legendState.style.fontFamily) {
      updateFontFamily(localFontFamily);
    }
  });

  $effect(() => {
    if (localFontSize !== legendState.style.fontSize) {
      updateFontSize(localFontSize);
    }
  });

  $effect(() => {
    if (localOpacity !== legendState.style.background.opacity) {
      updateOpacity(localOpacity);
    }
  });

  const backgroundEnabled = $derived(legendState.style.background.enabled);
  const bgColor = $derived(legendState.style.background.color);
  const bgHex = $derived(
    hslToHex(bgColor.hue, bgColor.saturation, bgColor.lightness)
  );

  const tabItems = $derived([
    { icon: Document, label: m.legend_content(), iconSize: 20 },
    { icon: TextFont, label: m.legend_style(), iconSize: 20 }
  ]);

  const activeTabIndex = $derived(legendState.activeTab === 'content' ? 0 : 1);

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
    legendActions.updateLegendItem(id, { [field]: value });
  }

  function handleTabChange(newIndex: number): void {
    legendActions.setActiveTab(newIndex === 0 ? 'content' : 'style');
  }

  function updateFontFamily(newFont: string): void {
    legendActions.setState({
      style: {
        ...legendState.style,
        fontFamily: newFont
      }
    });
  }

  function updateFontSize(newSize: number): void {
    legendActions.setState({
      style: {
        ...legendState.style,
        fontSize: newSize
      }
    });
  }

  function updateBackgroundEnabled(enabled: boolean): void {
    legendActions.setState({
      style: {
        ...legendState.style,
        background: {
          ...legendState.style.background,
          enabled
        }
      }
    });
  }

  function updateBackgroundColor(color: {
    hue: number;
    saturation: number;
    lightness: number;
  }): void {
    legendActions.setState({
      style: {
        ...legendState.style,
        background: {
          ...legendState.style.background,
          color
        }
      }
    });
  }

  function updateOpacity(newOpacity: number): void {
    legendActions.setState({
      style: {
        ...legendState.style,
        background: {
          ...legendState.style.background,
          opacity: newOpacity
        }
      }
    });
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

          {#snippet children()}
            <Grid padding noGutter>
              <Row>
                <Column>
                  <TextInput
                    labelText={m.legend_title()}
                    size="xl"
                    placeholder={item.name}
                    id={`${item.id}-title`}
                    value={item.title}
                    on:input={(e) =>
                      updateItemField(
                        item.id,
                        'title',
                        (e.target as HTMLInputElement).value
                      )}
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
                    value={item.subtitle}
                    on:input={(e) =>
                      updateItemField(
                        item.id,
                        'subtitle',
                        (e.target as HTMLInputElement).value
                      )}
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
                    value={item.note}
                    on:input={(e) =>
                      updateItemField(
                        item.id,
                        'note',
                        (e.target as HTMLInputElement).value
                      )}
                  />
                </Column>
              </Row>
            </Grid>
          {/snippet}
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
            size="xl"
          >
            {#each availableFonts as f}
              <SelectItem value={f} text={f} />
            {/each}
          </Select>
        </Column>

        <Column sm={2} md={4} lg={8}>
          <Select
            id="legend-font-size"
            labelText={m.legend_font_size()}
            bind:selected={localFontSize}
            size="xl"
          >
            {#each [10, 11, 12, 14, 16, 18, 20, 24] as s}
              <SelectItem value={s} text={String(s)} />
            {/each}
          </Select>
        </Column>
      </Row>

      <div class="divider" style="margin: var(--cds-spacing-05) 0;"></div>

      <Row>
        <Column>
          <Toggle
            labelText={m.legend_background()}
            id="legend-bg-toggle"
            toggled={backgroundEnabled}
            on:toggle={(e) => updateBackgroundEnabled(e.detail.toggled)}
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
              updateBackgroundColor({ hue, saturation, lightness });
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
    border-bottom: 1px solid #000;
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
    border-bottom-color: #000;
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
