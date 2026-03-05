<script lang="ts">
  import { m } from '$lib/paraglide/messages';
  import { Add, Document, Earth, Subtract } from 'carbon-icons-svelte';
  import { NumberInput } from 'carbon-components-svelte';
  import Separator from '../../commons/components/separator.svelte';
  import ToggleTabs from '../../commons/components/toggle-tabs.svelte';
  import {
    globalActions,
    globalState
  } from '../../commons/store/global.svelte';
  import { mapInstanceStore } from '../../commons/store/map-instance.store.svelte';
  import { zoomModeStore } from '../../commons/store/zoom-mode.store.svelte';

  const activeTabIndex = $derived(zoomModeStore.isMapMode ? 0 : 1);

  const zoomItems = [
    {
      icon: Earth,
      label: m.zoom_toolbar_map(),
      iconSize: 20
    },
    {
      icon: Document,
      label: m.zoom_toolbar_page(),
      iconSize: 20
    }
  ];

  function handleZoomModeChange(index: number): void {
    zoomModeStore.setMode(index === 0 ? 'map' : 'page');
  }

  function handleZoomIn(): void {
    if (activeTabIndex === 0) {
      mapInstanceStore.zoomIn();
    } else {
      globalActions.zoomInPage();
    }
  }

  function handleZoomOut(): void {
    if (activeTabIndex === 0) {
      mapInstanceStore.zoomOut();
    } else {
      globalActions.zoomOutPage();
    }
  }

  const currentZoomValue = $derived(
    activeTabIndex === 0
      ? mapInstanceStore.zoomLevel
      : globalState.zoom.pageZoomLevel
  );

  function handleZoomValueChange(value: number): void {
    const clamped = Math.max(10, Math.min(500, value));
    if (activeTabIndex === 0) {
      const mapZoom =
        mapInstanceStore.baseZoomLevel + 2 * Math.log2(clamped / 100);
      mapInstanceStore.setZoom(mapZoom);
    } else {
      globalActions.setPageZoom(clamped);
    }
  }
</script>

<nav id="khartis-zoom-toolbar" class="zoom-toolbar app-shadow">
  <ToggleTabs
    items={zoomItems}
    activeIndex={activeTabIndex}
    onChange={handleZoomModeChange}
    className="zoom-mode-tabs"
  />

  <div class="zoom-section">
    <div class="zoom-input-wrapper">
      <NumberInput
        size="sm"
        hideLabel
        labelText={m.zoom_reset_title()}
        min={10}
        max={500}
        step={10}
        value={currentZoomValue}
        on:change={(e) => {
          const val = (e as CustomEvent).detail;
          if (typeof val === 'number') handleZoomValueChange(val);
        }}
      />
    </div>

    <div class="zoom-controls">
      <button class="zoom-button" onclick={handleZoomOut} title={m.zoom_out()}>
        <Subtract size={16} />
      </button>

      <Separator orientation="vertical" />

      <button class="zoom-button" onclick={handleZoomIn} title={m.zoom_in()}>
        <Add size={16} />
      </button>
    </div>
  </div>
</nav>

<style>
  .zoom-toolbar {
    padding: 0;
    width: 180px;
    background: var(--cds-ui-background);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    position: fixed;
    bottom: 24px;
    left: 24px;
    z-index: var(--z-toolbar);
  }

  .zoom-button {
    background: var(--cds-ui-01);
    color: var(--cds-text-primary);
    fill: currentColor;
  }

  .zoom-button:hover {
    background: var(--cds-hover-ui);
  }

  #khartis-zoom-toolbar :global(.zoom-mode-tabs .toggle-tab) {
    background: var(--cds-background);
    color: var(--cds-text-secondary);
  }

  #khartis-zoom-toolbar :global(.zoom-mode-tabs .toggle-tab.active) {
    background-color: var(--cds-ui-03);
    color: var(--cds-text-primary);
  }

  #khartis-zoom-toolbar :global(.zoom-mode-tabs) {
    background: var(--cds-background);
  }

  .zoom-section {
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: var(--cds-ui-01);
  }

  .zoom-input-wrapper {
    min-width: 70px;
    max-width: 80px;
    margin-left: 4px;
  }

  .zoom-input-wrapper :global(.bx--number) {
    width: 100%;
  }

  .zoom-input-wrapper :global(.bx--number input[type='number']) {
    padding: 0 4px;
    font-size: 0.8em;
    height: 32px;
    min-height: 32px;
  }

  .zoom-input-wrapper :global(.bx--number__controls) {
    display: none;
  }

  .zoom-controls {
    display: flex;
    align-items: center;
    gap: 0;
    margin-right: 8px;
  }

  .zoom-button {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0 8px;
    border: none;
    cursor: pointer;
    min-width: 32px;
    height: 32px;
    font-size: 0.9em;
    transition: background 0.15s;
  }

  #khartis-zoom-toolbar :global(.separator) {
    height: 24px;
    margin: 0 2px;
  }

  @media (max-width: 1023px) {
    .zoom-toolbar {
      bottom: calc(60px + env(safe-area-inset-bottom, 0px) + 70px);
      left: var(--cds-spacing-03);
      width: 160px;
    }
  }
</style>
