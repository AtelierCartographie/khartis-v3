<script lang="ts">
  import { m } from '$lib/paraglide/messages';
  import { Add, Document, Earth, Subtract } from 'carbon-icons-svelte';
  import Separator from '../../commons/components/separator.svelte';
  import ToggleTabs from '../../commons/components/toggle-tabs.svelte';
  import { mapInstanceStore } from '../../commons/store/map-instance.store.svelte';
  import {
    globalActions,
    globalState
  } from '../../commons/store/global.svelte';

  let activeTabIndex: number = $state(0);

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
    activeTabIndex = index;
  }

  function handleZoomIn(): void {
    if (activeTabIndex === 0) {
      mapInstanceStore.map?.zoomIn();
    } else {
      globalActions.zoomInPage();
    }
  }

  function handleZoomOut(): void {
    if (activeTabIndex === 0) {
      mapInstanceStore.map?.zoomOut();
    } else {
      globalActions.zoomOutPage();
    }
  }

  function handleResetZoom(): void {
    if (activeTabIndex === 0) {
      const baseZoom = mapInstanceStore.baseZoomLevel;
      mapInstanceStore.map?.setZoom(baseZoom);
    } else {
      globalActions.resetPageZoom();
    }
  }

  function handleKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleResetZoom();
    }
  }

  const displayValue = $derived(
    activeTabIndex === 0
      ? `${mapInstanceStore.zoomLevel} %`
      : `${globalState.zoom.pageZoomLevel} %`
  );
</script>

<nav id="khartis-zoom-toolbar" class="zoom-toolbar app-shadow">
  <ToggleTabs
    items={zoomItems}
    bind:activeIndex={activeTabIndex}
    onChange={handleZoomModeChange}
    className="zoom-mode-tabs"
  />

  <div class="zoom-section">
    <div
      class="zoom-display"
      title="Click to reset zoom
Shortcuts: Ctrl/Cmd + Plus/Minus to zoom, Ctrl/Cmd + 0 to reset, Alt + Z to switch mode"
      onclick={handleResetZoom}
      onkeydown={handleKeyDown}
      role="button"
      tabindex="0"
    >
      <span>{displayValue}</span>
    </div>

    <div class="zoom-controls">
      <button class="zoom-button" onclick={handleZoomOut} title="Zoom out">
        <Subtract size={16} />
      </button>

      <Separator orientation="vertical" />

      <button class="zoom-button" onclick={handleZoomIn} title="Zoom in">
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
    z-index: 1000;
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

  .zoom-display {
    font-size: 0.9em;
    font-weight: 500;
    color: var(--cds-text-primary);
    min-width: 60px;
    text-align: center;
    margin-left: 12px;
    cursor: pointer;
    padding: 4px 8px;
    transition: background 0.15s;
  }

  .zoom-display:hover {
    background: var(--cds-hover-ui);
  }

  .zoom-display:focus {
    outline: 2px solid var(--cds-focus);
    outline-offset: 1px;
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
</style>
