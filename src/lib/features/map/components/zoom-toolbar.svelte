<script lang="ts">
  import { m } from '$lib/paraglide/messages';
  import { Add, Document, Earth, Subtract } from 'carbon-icons-svelte';
  import IconButton from '../../commons/components/carbon/icon-button.svelte';
  import ToggleTabs from '../../commons/components/toggle-tabs.svelte';
  import { KEY } from '../../commons/constants/dom.constants';
  import {
    globalActions,
    globalState
  } from '../../commons/store/global.svelte';
  import { mapInstanceStore } from '../../commons/store/map-instance.store.svelte';
  import { zoomModeStore } from '../../commons/store/zoom-mode.store.svelte';
  import { dispatchWorkspaceFit } from '../../commons/utils/workspace-viewport.utils';
  import {
    MAP_ZOOM_INPUT_STEP,
    MAX_MAP_ZOOM_PERCENT,
    MIN_MAP_ZOOM_PERCENT,
    resolveMapZoomLevel
  } from '../utils/map-zoom.utils';

  const activeTabIndex = $derived(zoomModeStore.isMapMode ? 0 : 1);

  const zoomItems = $derived([
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
  ]);

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

  function fitActiveMode(): void {
    if (activeTabIndex === 0) {
      mapInstanceStore.clearPersistedViewState();
      mapInstanceStore.fitToOrthographicBounds('reset');
    } else {
      dispatchWorkspaceFit();
    }
  }

  function handleTabDoubleClick(index: number): void {
    if (index !== activeTabIndex) return;
    fitActiveMode();
  }

  function tabTitle(index: number, isActive: boolean): string | undefined {
    if (!isActive) return undefined;
    return m.zoom_tab_double_click_hint();
  }

  const currentZoomValue = $derived(
    activeTabIndex === 0
      ? mapInstanceStore.zoomLevel
      : globalState.zoom.pageZoomLevel
  );
  let zoomInputValue = $derived(String(currentZoomValue));

  function handleZoomValueChange(value: number): void {
    const clamped = Math.max(
      MIN_MAP_ZOOM_PERCENT,
      Math.min(MAX_MAP_ZOOM_PERCENT, value)
    );
    if (activeTabIndex === 0) {
      mapInstanceStore.setZoom(
        resolveMapZoomLevel(mapInstanceStore.baseZoomLevel, clamped)
      );
    } else {
      globalActions.setPageZoom(clamped);
    }
  }

  function sanitizeZoomValue(value: string): string {
    return value.replace(/\D/g, '').slice(0, 3);
  }

  function commitZoomValue(rawValue: string): void {
    const nextValue = Number.parseInt(rawValue, 10);

    if (Number.isNaN(nextValue)) {
      zoomInputValue = String(currentZoomValue);
      return;
    }

    const clamped = Math.max(
      MIN_MAP_ZOOM_PERCENT,
      Math.min(MAX_MAP_ZOOM_PERCENT, nextValue)
    );
    zoomInputValue = String(clamped);
    handleZoomValueChange(clamped);
  }

  function handleZoomInput(event: Event): void {
    zoomInputValue = sanitizeZoomValue(
      (event.currentTarget as HTMLInputElement).value
    );
  }

  function handleZoomInputBlur(): void {
    commitZoomValue(zoomInputValue);
  }

  function handleZoomInputKeydown(event: KeyboardEvent): void {
    if (event.key === KEY.ENTER) {
      commitZoomValue(zoomInputValue);
      (event.currentTarget as HTMLInputElement).blur();
    }

    if (event.key === KEY.ESCAPE) {
      zoomInputValue = String(currentZoomValue);
      (event.currentTarget as HTMLInputElement).blur();
    }
  }
</script>

<nav id="khartis-zoom-toolbar" class="zoom-toolbar app-shadow">
  <ToggleTabs
    items={zoomItems}
    activeIndex={activeTabIndex}
    onChange={handleZoomModeChange}
    onDoubleClick={handleTabDoubleClick}
    tabTitle={tabTitle}
    className="zoom-mode-tabs"
    activeClass="active"
    fullWidthClass="full-width"
    hideInactiveLabel={true}
  />

  <div class="zoom-section" title={m.zoom_reset_title()}>
    <div class="zoom-value">
      <input
        id="khartis-zoom-toolbar-input"
        class="zoom-input"
        type="number"
        inputmode="numeric"
        aria-label={m.zoom_value_input_label()}
        min={MIN_MAP_ZOOM_PERCENT}
        max={MAX_MAP_ZOOM_PERCENT}
        step={MAP_ZOOM_INPUT_STEP}
        value={zoomInputValue}
        oninput={handleZoomInput}
        onblur={handleZoomInputBlur}
        onkeydown={handleZoomInputKeydown}
      />
    </div>

    <div class="zoom-controls">
      <IconButton
        kind="ghost"
        size="small"
        class="zoom-button"
        icon={Subtract}
        iconDescription={m.zoom_out()}
        tooltipPosition="top"
        on:click={handleZoomOut}
      />

      <IconButton
        kind="ghost"
        size="small"
        class="zoom-button"
        icon={Add}
        iconDescription={m.zoom_in()}
        tooltipPosition="top"
        on:click={handleZoomIn}
      />
    </div>
  </div>
</nav>

<style>
  .zoom-toolbar {
    padding: 0;
    width: 180px;
    background: var(--cds-background, #ffffff);
    border-radius: 0;
    font-family: 'IBM Plex Sans', sans-serif;
    font-size: 0.75rem;
    position: fixed;
    bottom: 24px;
    left: 24px;
    z-index: var(--z-toolbar);
    overflow: hidden;
  }

  #khartis-zoom-toolbar :global(.zoom-mode-tabs) {
    border-color: var(--cds-ui-03, #c6c6c6);
    border-radius: 0;
  }

  #khartis-zoom-toolbar :global(.zoom-mode-tabs .toggle-tab) {
    min-height: 42px;
    height: 42px;
    gap: 8px;
    transition:
      width 0.15s ease,
      padding 0.15s ease;
  }

  #khartis-zoom-toolbar :global(.zoom-mode-tabs .toggle-tab.full-width) {
    width: calc(100% - 50px);
    padding: 0 12px;
    justify-content: flex-start;
  }

  #khartis-zoom-toolbar :global(.zoom-mode-tabs .toggle-tab:not(.full-width)) {
    width: 50px;
    padding: 0;
    justify-content: center;
  }

  #khartis-zoom-toolbar :global(.zoom-mode-tabs .toggle-tab span) {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 0.75rem;
    font-weight: 600;
    line-height: 1.25rem;
  }

  .zoom-section {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    min-height: 42px;
    background: var(--cds-background, #ffffff);
  }

  .zoom-value {
    min-width: 0;
  }

  .zoom-input {
    width: 100%;
    height: 100%;
    min-height: 28px;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--text-emphasis, #161616);
    font: inherit;
    font-size: 0.875rem;
    font-weight: 400;
    line-height: 1.25rem;
    outline: none;
    text-align: center;
    appearance: textfield;
    -moz-appearance: textfield;
  }

  .zoom-input::-webkit-outer-spin-button,
  .zoom-input::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }

  .zoom-controls {
    display: grid;
    grid-template-columns: 50px 50px;
    align-items: center;
    justify-items: center;
    align-self: stretch;
    border-left: none;
    position: relative;
  }

  .zoom-controls::before,
  .zoom-controls::after {
    content: '';
    position: absolute;
    top: 8px;
    bottom: 8px;
    width: 1px;
    background: var(--cds-border-subtle-01, #c6c6c6);
  }

  .zoom-controls::before {
    left: 0;
  }

  .zoom-controls::after {
    left: 50%;
    transform: translateX(-0.5px);
  }

  #khartis-zoom-toolbar :global(.zoom-button.bx--btn) {
    min-width: 50px;
    min-height: 28px;
    width: 50px;
    height: 100%;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--text-emphasis, #161616);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  #khartis-zoom-toolbar :global(.zoom-button.bx--btn:hover),
  #khartis-zoom-toolbar :global(.zoom-button.bx--btn:active),
  #khartis-zoom-toolbar :global(.zoom-button.bx--btn:focus) {
    background: transparent;
    box-shadow: none;
    outline: none;
  }

  @media (max-width: 1023px) {
    .zoom-toolbar {
      bottom: calc(60px + env(safe-area-inset-bottom, 0px) + 70px);
      left: var(--cds-spacing-03);
      width: 172px;
    }

    #khartis-zoom-toolbar :global(.zoom-mode-tabs .toggle-tab.full-width) {
      padding-inline: 10px;
    }

    #khartis-zoom-toolbar
      :global(.zoom-mode-tabs .toggle-tab:not(.full-width)) {
      width: 50px;
    }

    .zoom-section {
      padding-left: 0;
    }
  }
</style>
