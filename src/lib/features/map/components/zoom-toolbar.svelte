<script lang="ts">
  import { m } from '$lib/paraglide/messages';
  import {
    Add,
    Document,
    Earth,
    Subtract,
    ZoomReset
  } from 'carbon-icons-svelte';
  import clsx from 'clsx';
  import IconButton from '../../commons/components/carbon/icon-button.svelte';
  import ToggleTabs from '../../commons/components/toggle-tabs.svelte';
  import Tooltip from '../../commons/components/carbon/tooltip.svelte';
  import { KEY } from '../../commons/constants/dom.constants';
  import {
    globalActions,
    globalState
  } from '../../commons/stores/global.svelte';
  import { mapInstanceStore } from '../../commons/stores/map-instance.store.svelte';
  import { ViewMode } from '../constants/map.constants';
  import { deckDebugStore } from '../stores/deck-debug.store.svelte';
  import { zoomModeStore } from '../../commons/stores/zoom-mode.store.svelte';
  import { dispatchWorkspaceFit } from '../../commons/utils/workspace-viewport.utils';
  import {
    MAP_ZOOM_INPUT_STEP,
    MAX_MAP_ZOOM_PERCENT,
    MIN_MAP_ZOOM_PERCENT
  } from '../utils/map-zoom.utils';

  type DebugMetricTone = 'neutral' | 'good' | 'warn' | 'bad';
  type FrameTimeInsightMessages = {
    good: () => string;
    ok: () => string;
    warn: () => string;
    bad: () => string;
  };

  const FRAME_TIME_GOOD_MAX_MS = 4;
  const FRAME_TIME_OK_MAX_MS = 8;
  const FRAME_TIME_WARN_MAX_MS = 16;
  const CPU_FRAME_TIME_MESSAGES: FrameTimeInsightMessages = {
    good: m.deck_debug_metric_cpu_state_good,
    ok: m.deck_debug_metric_cpu_state_ok,
    warn: m.deck_debug_metric_cpu_state_warn,
    bad: m.deck_debug_metric_cpu_state_bad
  };
  const GPU_FRAME_TIME_MESSAGES: FrameTimeInsightMessages = {
    good: m.deck_debug_metric_gpu_state_good,
    ok: m.deck_debug_metric_gpu_state_ok,
    warn: m.deck_debug_metric_gpu_state_warn,
    bad: m.deck_debug_metric_gpu_state_bad
  };

  const activeTabIndex = $derived(zoomModeStore.isMapMode ? 0 : 1);
  const showDeckDebugPanel = $derived(isDeckDebugEnabled());
  const deckDebugMetrics = $derived(deckDebugStore.metrics);
  const deckDebugViewMode = $derived(deckDebugStore.viewMode);
  const debugTooltipDirection = $derived(
    globalState.isMobileView ? 'bottom' : 'top'
  );
  const debugTooltipAlign = $derived(
    globalState.isMobileView ? 'start' : 'center'
  );

  const zoomButtonTooltipPosition = $derived(
    globalState.isMobileView ? 'bottom' : 'top'
  );

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

  function isDeckDebugEnabled(): boolean {
    return import.meta.env.DEV;
  }

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
      mapInstanceStore.resetZoom();
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
  const activeMinZoomPercent = $derived(
    activeTabIndex === 0 ? MIN_MAP_ZOOM_PERCENT : globalState.zoom.minPageZoom
  );
  const activeMaxZoomPercent = $derived(
    activeTabIndex === 0 ? MAX_MAP_ZOOM_PERCENT : globalState.zoom.maxPageZoom
  );
  let zoomInputValue = $derived(String(currentZoomValue));

  function handleZoomValueChange(value: number): void {
    const clamped = Math.max(
      activeMinZoomPercent,
      Math.min(activeMaxZoomPercent, value)
    );
    if (activeTabIndex === 0) {
      mapInstanceStore.setZoomPercent(clamped);
    } else {
      globalActions.setPageZoom(clamped);
    }
  }

  function sanitizeZoomValue(value: string): string {
    return value
      .replace(/\D/g, '')
      .slice(0, String(activeMaxZoomPercent).length);
  }

  function commitZoomValue(rawValue: string): void {
    const nextValue = Number.parseInt(rawValue, 10);

    if (Number.isNaN(nextValue)) {
      zoomInputValue = String(currentZoomValue);
      return;
    }

    const clamped = Math.max(
      activeMinZoomPercent,
      Math.min(activeMaxZoomPercent, nextValue)
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

  function formatDebugNumber(
    value: number | null | undefined,
    digits = 1
  ): string {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return '--';
    }

    const absolute = Math.abs(value);
    const fractionDigits = absolute >= 100 ? 0 : absolute >= 10 ? 1 : digits;

    return value.toFixed(fractionDigits);
  }

  function formatDebugMilliseconds(value: number | null | undefined): string {
    const formatted = formatDebugNumber(value, 2);
    return formatted === '--' ? formatted : `${formatted} ms`;
  }

  function isFiniteDebugMetric(
    value: number | null | undefined
  ): value is number {
    return typeof value === 'number' && Number.isFinite(value);
  }

  function getFpsInsight(value: number | null | undefined): string {
    if (!isFiniteDebugMetric(value)) {
      return m.deck_debug_metric_pending();
    }

    if (value >= 50) {
      return m.deck_debug_metric_fps_state_good();
    }

    if (value >= 30) {
      return m.deck_debug_metric_fps_state_ok();
    }

    if (value >= 20) {
      return m.deck_debug_metric_fps_state_warn();
    }

    return m.deck_debug_metric_fps_state_bad();
  }

  function getFrameTimeInsight(
    value: number | null | undefined,
    messages: FrameTimeInsightMessages
  ): string {
    if (!isFiniteDebugMetric(value)) {
      return m.deck_debug_metric_pending();
    }

    if (value <= FRAME_TIME_GOOD_MAX_MS) {
      return messages.good();
    }

    if (value <= FRAME_TIME_OK_MAX_MS) {
      return messages.ok();
    }

    if (value <= FRAME_TIME_WARN_MAX_MS) {
      return messages.warn();
    }

    return messages.bad();
  }

  function getFpsTone(value: number | null | undefined): DebugMetricTone {
    if (!isFiniteDebugMetric(value)) {
      return 'neutral';
    }

    if (value >= 30) {
      return 'good';
    }

    if (value >= 20) {
      return 'warn';
    }

    return 'bad';
  }

  function getFrameTimeTone(value: number | null | undefined): DebugMetricTone {
    if (!isFiniteDebugMetric(value)) {
      return 'neutral';
    }

    if (value <= FRAME_TIME_OK_MAX_MS) {
      return 'good';
    }

    if (value <= FRAME_TIME_WARN_MAX_MS) {
      return 'warn';
    }

    return 'bad';
  }

  const debugMetricsList = $derived([
    {
      key: 'fps',
      label: m.deck_debug_metric_fps(),
      value: formatDebugNumber(deckDebugMetrics?.fps),
      insight: getFpsInsight(deckDebugMetrics?.fps),
      tone: getFpsTone(deckDebugMetrics?.fps)
    },
    {
      key: 'cpu',
      label: m.deck_debug_metric_cpu(),
      value: formatDebugMilliseconds(deckDebugMetrics?.cpuTimePerFrame),
      insight: getFrameTimeInsight(
        deckDebugMetrics?.cpuTimePerFrame,
        CPU_FRAME_TIME_MESSAGES
      ),
      tone: getFrameTimeTone(deckDebugMetrics?.cpuTimePerFrame)
    },
    {
      key: 'gpu',
      label: m.deck_debug_metric_gpu(),
      value: formatDebugMilliseconds(deckDebugMetrics?.gpuTimePerFrame),
      insight: getFrameTimeInsight(
        deckDebugMetrics?.gpuTimePerFrame,
        GPU_FRAME_TIME_MESSAGES
      ),
      tone: getFrameTimeTone(deckDebugMetrics?.gpuTimePerFrame)
    }
  ]);
</script>

<div class="zoom-toolbar-shell">
  <nav id="khartis-zoom-toolbar" class="zoom-toolbar app-shadow">
    <ToggleTabs
      items={zoomItems}
      activeIndex={activeTabIndex}
      onchange={handleZoomModeChange}
      ondblclick={handleTabDoubleClick}
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
          min={activeMinZoomPercent}
          max={activeMaxZoomPercent}
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
          icon={ZoomReset}
          iconDescription={m.zoom_reset()}
          tooltipPosition={zoomButtonTooltipPosition}
          on:click={fitActiveMode}
        />

        <IconButton
          kind="ghost"
          size="small"
          class="zoom-button"
          icon={Subtract}
          iconDescription={m.zoom_out()}
          tooltipPosition={zoomButtonTooltipPosition}
          on:click={handleZoomOut}
        />

        <IconButton
          kind="ghost"
          size="small"
          class="zoom-button"
          icon={Add}
          iconDescription={m.zoom_in()}
          tooltipPosition={zoomButtonTooltipPosition}
          on:click={handleZoomIn}
        />
      </div>
    </div>
  </nav>

  {#if showDeckDebugPanel && deckDebugViewMode}
    <aside class="zoom-debug-panel">
      <div class="zoom-debug-content">
        <div class="zoom-debug-header">
          <span class="zoom-debug-mode">
            {deckDebugViewMode === ViewMode.ORTHOGRAPHIC
              ? m.deck_debug_mode_ortho()
              : m.deck_debug_mode_map()}
          </span>
        </div>

        <div class="zoom-debug-metrics">
          {#each debugMetricsList as metric (metric.key)}
            <div
              class={clsx(
                'zoom-debug-metric',
                `zoom-debug-metric--${metric.tone}`
              )}
            >
              <Tooltip
                direction={debugTooltipDirection}
                align={debugTooltipAlign}
                triggerText={`${metric.label} ${metric.value}`}
                iconDescription={metric.label}
              >
                <div class="zoom-debug-tooltip-card">
                  <p class="zoom-debug-tooltip-eyebrow">{metric.label}</p>
                  <p class="zoom-debug-tooltip-value">{metric.value}</p>
                  <p class="zoom-debug-tooltip-text">{metric.insight}</p>
                </div>
              </Tooltip>
            </div>
          {/each}
        </div>
      </div>
    </aside>
  {/if}
</div>

<style>
  .zoom-toolbar-shell {
    position: fixed;
    bottom: 24px;
    left: 24px;
    z-index: var(--z-toolbar);
    display: flex;
    align-items: stretch;
    gap: 8px;
  }

  .zoom-toolbar {
    padding: 0;
    width: 230px;
    background: var(--cds-background, #ffffff);
    border-radius: 0;
    font-family: 'IBM Plex Sans', sans-serif;
    font-size: 0.75rem;
    overflow: hidden;
  }

  .zoom-debug-panel {
    width: auto;
    min-width: 0;
    height: 84px;
    padding: 0 0 0 0.85rem;
    display: flex;
    align-items: center;
    pointer-events: auto;
    position: relative;
  }

  .zoom-debug-panel::before {
    content: '';
    width: 1px;
    height: 2.3rem;
    margin-right: 0.85rem;
    background: linear-gradient(
      to bottom,
      rgba(141, 141, 141, 0),
      rgba(141, 141, 141, 0.5),
      rgba(141, 141, 141, 0)
    );
  }

  .zoom-debug-content {
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 0.45rem;
    width: 100%;
    min-width: 0;
  }

  .zoom-debug-header {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    width: 100%;
    min-width: 0;
    white-space: nowrap;
  }

  .zoom-debug-metrics {
    display: flex;
    align-items: flex-start;
    gap: 0.6rem;
    width: 100%;
    min-width: 0;
    white-space: nowrap;
  }

  .zoom-debug-mode {
    font-size: 0.625rem;
    font-weight: 600;
    line-height: 1;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  .zoom-debug-mode {
    color: var(--cds-text-gray, #525252);
  }

  .zoom-debug-metric {
    min-width: 0;
    --zoom-debug-metric-background: color-mix(
      in srgb,
      var(--cds-layer-hover, #e8e8e8) 72%,
      transparent
    );
    --zoom-debug-metric-color: inherit;
  }

  .zoom-debug-metric--good {
    --zoom-debug-metric-background: var(--cds-support-success, #24a148);
    --zoom-debug-metric-color: var(--cds-text-on-color, #ffffff);
  }

  .zoom-debug-metric--warn {
    --zoom-debug-metric-background: var(--cds-support-warning, #f1c21b);
    --zoom-debug-metric-color: var(--cds-text-primary, #161616);
  }

  .zoom-debug-metric--bad {
    --zoom-debug-metric-background: var(--cds-support-error, #da1e28);
    --zoom-debug-metric-color: var(--cds-text-on-color, #ffffff);
  }

  .zoom-debug-metric :global(.khartis-carbon-rich-tooltip-trigger) {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 0;
    padding: 0.28rem 0.5rem;
    border-radius: 0;
    background: var(--zoom-debug-metric-background);
    color: var(--zoom-debug-metric-color);
    text-decoration: none;
    font-size: 0.625rem;
    font-weight: 600;
    line-height: 1;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    font-variant-numeric: tabular-nums;
  }

  .zoom-debug-metric :global(.khartis-carbon-rich-tooltip-trigger:hover),
  .zoom-debug-metric :global(.khartis-carbon-rich-tooltip-trigger:focus) {
    color: var(--zoom-debug-metric-color);
  }

  .zoom-debug-metric :global(.khartis-carbon-rich-tooltip-trigger svg) {
    display: none;
  }

  .zoom-debug-metric :global(.khartis-carbon-rich-tooltip-trigger span) {
    min-width: 0;
    white-space: nowrap;
  }

  .zoom-debug-tooltip-card {
    display: grid;
    gap: 0.25rem;
    max-width: 13.5rem;
  }

  .zoom-debug-tooltip-eyebrow {
    font-size: 0.6rem;
    font-weight: 600;
    line-height: 1;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    opacity: 0.72;
  }

  .zoom-debug-tooltip-value {
    font-family:
      ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono',
      'Courier New', monospace;
    font-size: 0.82rem;
    font-weight: 600;
    line-height: 1.2;
  }

  .zoom-debug-tooltip-text {
    margin: 0;
    max-width: 13.5rem;
    font-size: 0.75rem;
    line-height: 1.3;
  }

  #khartis-zoom-toolbar :global(.zoom-mode-tabs) {
    border-color: var(--cds-ui-03, #c6c6c6);
    border-radius: 0;
  }

  #khartis-zoom-toolbar :global(.zoom-mode-tabs .toggle-tab) {
    min-height: 42px;
    height: 42px;
    gap: 8px;
    border-radius: 0;
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
    color: var(--cds-text-primary, var(--cds-text-01, #161616));
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
    grid-template-columns: repeat(3, 50px);
    align-items: center;
    justify-items: center;
    align-self: stretch;
    border-left: none;
    position: relative;
  }

  .zoom-controls::before {
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

  #khartis-zoom-toolbar :global(.zoom-button.bx--btn) {
    min-width: 50px;
    min-height: 42px;
    width: 50px;
    height: 100%;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--cds-text-primary, var(--cds-text-01, #161616));
    display: flex;
    align-items: center;
    justify-content: center;
  }

  #khartis-zoom-toolbar :global(.zoom-button.bx--btn + .zoom-button.bx--btn) {
    box-shadow: inset 1px 0 0 var(--cds-border-subtle-01, #c6c6c6);
  }

  #khartis-zoom-toolbar :global(.zoom-button.bx--btn:hover),
  #khartis-zoom-toolbar :global(.zoom-button.bx--btn:active),
  #khartis-zoom-toolbar :global(.zoom-button.bx--btn:focus) {
    background: transparent;
    box-shadow: none;
    outline: none;
  }

  @media (max-width: 1023px) {
    .zoom-toolbar-shell {
      top: calc(var(--cds-header-height) + var(--cds-spacing-03));
      left: var(--cds-spacing-03);
      bottom: auto;
      gap: 6px;
      z-index: var(--z-mobile-toolbar);
    }

    .zoom-toolbar {
      width: 150px;
    }

    .zoom-section {
      grid-template-columns: auto;
    }

    .zoom-value {
      display: none;
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

    .zoom-debug-panel {
      position: fixed;
      top: calc(var(--cds-header-height) + var(--cds-spacing-03));
      left: auto;
      right: var(--cds-spacing-03);
      width: auto;
      min-width: 0;
      height: 56px;
      padding: 0 0.65rem;
      background: rgba(244, 244, 244, 0.9);
      backdrop-filter: blur(12px);
      z-index: var(--z-toolbar);
    }

    .zoom-debug-panel::before {
      display: none;
    }

    .zoom-debug-content {
      gap: 0.3rem;
    }

    .zoom-debug-header {
      gap: 0.35rem;
    }

    .zoom-debug-metrics {
      gap: 0.45rem;
      justify-content: space-between;
    }

    .zoom-debug-mode,
    .zoom-debug-metric :global(.khartis-carbon-rich-tooltip-trigger) {
      font-size: 0.56rem;
    }

    .zoom-debug-metric {
      min-width: 0;
    }

    .zoom-debug-metric :global(.khartis-carbon-rich-tooltip-trigger) {
      padding: 0.24rem 0.34rem;
    }

    .zoom-debug-tooltip-card {
      max-width: 12rem;
    }

    .zoom-debug-tooltip-value {
      font-size: 0.76rem;
    }

    .zoom-debug-tooltip-text {
      max-width: 12rem;
      font-size: 0.69rem;
    }
  }

  :global(:root[theme='g100']) .zoom-debug-mode {
    color: var(--cds-text-gray, #a8a8a8);
  }

  :global(:root[theme='g100']) .zoom-debug-panel::before {
    background: linear-gradient(
      to bottom,
      rgba(244, 244, 244, 0),
      rgba(244, 244, 244, 0.28),
      rgba(244, 244, 244, 0)
    );
  }

  @media (max-width: 1023px) {
    :global(:root[theme='g100']) .zoom-debug-panel {
      background: rgba(22, 22, 22, 0.9);
    }
  }
</style>
