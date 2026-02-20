<script lang="ts">
  import * as m from '$lib/paraglide/messages';
  import ToggleTabs from '$lib/features/commons/components/toggle-tabs.svelte';
  import { ColorSelector } from '../shared';
  import {
    type Palette,
    getPatternPalettes,
    interpolateColors,
    buildPatternBackground
  } from './palette.constants';

  interface Props {
    numClasses: number;
    onColorsChange?: (colors: string[]) => void;
    onPatternSelect?: (palette: Palette) => void;
  }

  let { numClasses, onColorsChange, onPatternSelect }: Props = $props();

  let activeTab = $state(0);
  let singleColor = $state('#08519c');
  let startColor = $state('#f7fbff');
  let endColor = $state('#08519c');

  const tabItems = $derived([
    { label: m.palette_custom_1_color() },
    { label: m.palette_custom_2_colors() },
    { label: m.palette_custom_patterns() }
  ]);

  const patternPalettes = $derived(getPatternPalettes());

  function handleTabChange(index: number) {
    activeTab = index;
  }

  function handleSingleColorChange(color: string) {
    singleColor = color;
    const colors = interpolateColors(['#ffffff', color], numClasses);
    onColorsChange?.(colors);
  }

  function handleStartColorChange(color: string) {
    startColor = color;
    const colors = interpolateColors([startColor, endColor], numClasses);
    onColorsChange?.(colors);
  }

  function handleEndColorChange(color: string) {
    endColor = color;
    const colors = interpolateColors([startColor, endColor], numClasses);
    onColorsChange?.(colors);
  }

  function handlePatternClick(palette: Palette) {
    onPatternSelect?.(palette);
  }
</script>

<div class="palette-custom">
  <div class="section-divider">
    <span class="divider-label">{m.palette_custom()}</span>
  </div>

  <ToggleTabs
    items={tabItems}
    activeIndex={activeTab}
    onChange={handleTabChange}
    hideInactiveLabel={false}
  />

  <div class="tab-content">
    {#if activeTab === 0}
      <ColorSelector
        label={m.color()}
        value={singleColor}
        onchange={handleSingleColorChange}
      />
    {:else if activeTab === 1}
      <div class="two-colors">
        <ColorSelector
          label={m.color()}
          value={startColor}
          onchange={handleStartColorChange}
        />
        <ColorSelector
          label={m.color()}
          value={endColor}
          onchange={handleEndColorChange}
        />
      </div>
    {:else if activeTab === 2}
      <div class="pattern-list">
        {#each patternPalettes as palette (palette.id)}
          <button
            type="button"
            class="pattern-item"
            onclick={() => handlePatternClick(palette)}
            aria-label={palette.name}
          >
            <div
              class="pattern-preview"
              style="background: {buildPatternBackground(palette)}"
            ></div>
            <span class="pattern-name">{palette.name}</span>
          </button>
        {/each}
      </div>
    {/if}
  </div>
</div>

<style lang="scss">
  .palette-custom {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-03);
  }

  .section-divider {
    display: flex;
    align-items: center;
    gap: var(--cds-spacing-03);
    padding-top: var(--cds-spacing-03);

    &::before,
    &::after {
      content: '';
      flex: 1;
      height: 1px;
      background: var(--cds-border-subtle);
    }
  }

  .divider-label {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--cds-text-secondary);
    white-space: nowrap;
  }

  .tab-content {
    padding-top: var(--cds-spacing-02);
  }

  .two-colors {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-03);
  }

  .pattern-list {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-02);
  }

  .pattern-item {
    display: flex;
    align-items: center;
    gap: var(--cds-spacing-03);
    padding: var(--cds-spacing-02);
    background: transparent;
    border: 1px solid var(--cds-border-subtle);
    border-radius: 4px;
    cursor: pointer;
    width: 100%;

    &:hover {
      background-color: var(--cds-layer-hover);
      border-color: var(--cds-border-strong);
    }
  }

  .pattern-preview {
    width: 60px;
    height: 20px;
    border-radius: 2px;
    flex-shrink: 0;
    background-size:
      auto,
      8px 8px,
      auto;
  }

  .pattern-name {
    font-size: 0.875rem;
    color: var(--cds-text-primary);
  }
</style>
