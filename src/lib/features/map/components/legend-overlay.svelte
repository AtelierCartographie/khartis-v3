<script lang="ts">
  import { LegendPosition } from '$lib/features/commons/constants/ui.constants';
  import { hslToHex } from '$lib/features/commons/utils/color-utils';
  import { getLegendState } from '$lib/features/step-toolbar/tools/legend/legend.store.svelte';

  const legendState = $derived(getLegendState());
  const visibleItems = $derived(legendState.items.filter((i) => i.visible));

  const bgColor = $derived(legendState.style.background.color);
  const bgHex = $derived(
    hslToHex(bgColor.hue, bgColor.saturation, bgColor.lightness)
  );

  const positionClass = $derived.by(() => {
    switch (legendState.position) {
      case LegendPosition.TOP_LEFT:
        return 'top-left';
      case LegendPosition.TOP_RIGHT:
        return 'top-right';
      case LegendPosition.BOTTOM_LEFT:
        return 'bottom-left';
      case LegendPosition.BOTTOM_RIGHT:
        return 'bottom-right';
      default:
        return 'top-right';
    }
  });

  const containerStyle = $derived.by(() => {
    const styles: string[] = [
      `font-family: ${legendState.style.fontFamily}, sans-serif`,
      `font-size: ${legendState.style.fontSize}px`
    ];

    if (legendState.style.background.enabled) {
      styles.push(`background-color: ${bgHex}`);
      styles.push(`opacity: ${legendState.style.background.opacity / 100}`);
    }

    return styles.join('; ');
  });
</script>

{#if legendState.visible && visibleItems.length > 0}
  <div class="legend-overlay">
    <div class="legend-container {positionClass}" style={containerStyle}>
      {#each visibleItems as item (item.id)}
        <div class="legend-item">
          {#if item.title}
            <h4 class="legend-title">{item.title}</h4>
          {/if}
          {#if item.subtitle}
            <p class="legend-subtitle">{item.subtitle}</p>
          {/if}
          {#if item.note}
            <p class="legend-note">{item.note}</p>
          {/if}
        </div>
      {/each}
    </div>
  </div>
{/if}

<style>
  .legend-overlay {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: 10;
  }

  .legend-container {
    position: absolute;
    background: rgba(255, 255, 255, 0.95);
    padding: 12px 16px;
    border-radius: 4px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
    max-width: 280px;
    pointer-events: auto;
  }

  .legend-container.top-left {
    top: 16px;
    left: 16px;
  }

  .legend-container.top-right {
    top: 16px;
    right: 16px;
  }

  .legend-container.bottom-left {
    bottom: 16px;
    left: 16px;
  }

  .legend-container.bottom-right {
    bottom: 16px;
    right: 16px;
  }

  .legend-item {
    margin-bottom: 12px;
  }

  .legend-item:last-child {
    margin-bottom: 0;
  }

  .legend-title {
    margin: 0 0 4px 0;
    font-weight: 600;
    color: var(--cds-text-primary, #161616);
    line-height: 1.3;
  }

  .legend-subtitle {
    margin: 0 0 2px 0;
    color: var(--cds-text-secondary, #525252);
    font-size: 0.9em;
    line-height: 1.3;
  }

  .legend-note {
    margin: 0;
    color: var(--cds-text-helper, #6f6f6f);
    font-size: 0.85em;
    font-style: italic;
    line-height: 1.3;
  }
</style>
