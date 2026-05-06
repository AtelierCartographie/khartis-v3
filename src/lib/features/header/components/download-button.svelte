<script lang="ts">
  import Button from '$lib/features/commons/components/carbon/button.svelte';
  import {
    FormatMode,
    PageModel
  } from '$lib/features/commons/constants/ui.constants';
  import { getFormatState } from '$lib/features/step-toolbar/tools/format';
  import { m } from '$lib/paraglide/messages.js';
  import {
    Modal,
    RadioButton,
    RadioButtonGroup,
    TextInput
  } from 'carbon-components-svelte';
  import {
    DataStructured,
    DocumentExport,
    Download,
    Image
  } from 'carbon-icons-svelte';
  import { useExportModal } from '../use-export-modal.svelte';
  import {
    ExportTab,
    MAP_FORMAT,
    DATA_FORMAT,
    EXPORT_RESOLUTION,
    formatExportDimensions,
    getExportDimensionsForPage
  } from '../types';
  import type {
    MapExportFormat,
    DataExportFormat,
    ExportTabType,
    ExportResolution
  } from '../types';

  const modal = useExportModal();
  const currentFormat = $derived(getFormatState());

  const currentPageFormatLabel = $derived.by(() => {
    if (currentFormat.mode === FormatMode.CUSTOM) {
      return m.format_custom();
    }

    switch (currentFormat.model) {
      case PageModel.A4_LANDSCAPE:
        return m.format_model_a4_landscape();
      case PageModel.A4_PORTRAIT:
        return m.format_model_a4_portrait();
      case PageModel.A3_LANDSCAPE:
        return m.format_model_a3_landscape();
      case PageModel.A3_PORTRAIT:
        return m.format_model_a3_portrait();
      case PageModel.SCREEN_LANDSCAPE:
        return m.format_model_screen_landscape();
      case PageModel.SCREEN_PORTRAIT:
        return m.format_model_screen_portrait();
    }
  });

  const currentPageSizeLabel = $derived(
    formatExportDimensions({
      width: currentFormat.width,
      height: currentFormat.height
    })
  );

  const selectedExportSizeLabel = $derived(
    formatExportDimensions(
      getExportDimensionsForPage(
        currentFormat.width,
        currentFormat.height,
        modal.resolution
      )
    )
  );

  const exportSize1080pLabel = $derived(
    formatExportDimensions(
      getExportDimensionsForPage(
        currentFormat.width,
        currentFormat.height,
        EXPORT_RESOLUTION.HD_1080P
      )
    )
  );

  const exportSize2kLabel = $derived(
    formatExportDimensions(
      getExportDimensionsForPage(
        currentFormat.width,
        currentFormat.height,
        EXPORT_RESOLUTION.QHD_2K
      )
    )
  );

  const exportSize4kLabel = $derived(
    formatExportDimensions(
      getExportDimensionsForPage(
        currentFormat.width,
        currentFormat.height,
        EXPORT_RESOLUTION.UHD_4K
      )
    )
  );

  const exportTargets = $derived([
    {
      id: ExportTab.PROJECT,
      label: m.download_tab_project(),
      description: m.download_project_description(),
      icon: DocumentExport
    },
    {
      id: ExportTab.MAP,
      label: m.download_tab_map(),
      description: m.download_map_description(),
      icon: Image
    },
    {
      id: ExportTab.DATA,
      label: m.download_tab_data(),
      description: m.download_data_description(),
      icon: DataStructured
    }
  ]);

  const mapFormatOptions = $derived([
    {
      id: MAP_FORMAT.SVG,
      label: m.download_map_svg(),
      description: m.download_map_svg_note()
    },
    {
      id: MAP_FORMAT.JPG,
      label: m.download_map_jpg(),
      description: m.download_map_jpg_note()
    }
  ]);

  const resolutionOptions = $derived([
    {
      id: EXPORT_RESOLUTION.HD_1080P,
      label: m.download_resolution_1080p(),
      size: exportSize1080pLabel
    },
    {
      id: EXPORT_RESOLUTION.QHD_2K,
      label: m.download_resolution_2k(),
      size: exportSize2kLabel
    },
    {
      id: EXPORT_RESOLUTION.UHD_4K,
      label: m.download_resolution_4k(),
      size: exportSize4kLabel
    }
  ]);

  const dataFormatOptions = $derived([
    {
      id: DATA_FORMAT.CSV,
      label: m.download_data_csv()
    },
    {
      id: DATA_FORMAT.CSV_GEO,
      label: m.download_data_csv_geo()
    },
    {
      id: DATA_FORMAT.GEOJSON,
      label: m.download_data_geojson()
    }
  ]);

  function isMapExportFormat(value: unknown): value is MapExportFormat {
    return value === MAP_FORMAT.SVG || value === MAP_FORMAT.JPG;
  }

  function isDataExportFormat(value: unknown): value is DataExportFormat {
    return (
      value === DATA_FORMAT.CSV ||
      value === DATA_FORMAT.CSV_GEO ||
      value === DATA_FORMAT.GEOJSON
    );
  }

  function isExportResolution(value: unknown): value is ExportResolution {
    return (
      value === EXPORT_RESOLUTION.HD_1080P ||
      value === EXPORT_RESOLUTION.QHD_2K ||
      value === EXPORT_RESOLUTION.UHD_4K
    );
  }

  function handleMapFormatChange(event: CustomEvent<unknown>): void {
    if (!isMapExportFormat(event.detail) || event.detail === modal.mapFormat) {
      return;
    }

    modal.setMapFormat(event.detail);
  }

  function handleDataFormatChange(event: CustomEvent<unknown>): void {
    if (
      !isDataExportFormat(event.detail) ||
      event.detail === modal.dataFormat
    ) {
      return;
    }

    modal.setDataFormat(event.detail);
  }

  function handleResolutionChange(event: CustomEvent<unknown>): void {
    if (
      !isExportResolution(event.detail) ||
      event.detail === modal.resolution
    ) {
      return;
    }

    modal.setResolution(event.detail);
  }
</script>

<div id="khartis-download-button">
  <Button
    class="h-full"
    size="small"
    tooltipPosition="bottom"
    tooltipAlignment="end"
    iconDescription={m.download_tooltip()}
    kind="primary"
    icon={Download}
    on:click={modal.open}
  >
    {m.download_button()}
  </Button>
</div>

<Modal
  primaryButtonDisabled={modal.isExporting}
  secondaryButtonDisabled={modal.isExporting}
  open={modal.isOpen}
  modalHeading={m.download_modal_title()}
  primaryButtonText={modal.isExporting
    ? m.download_exporting()
    : m.download_button()}
  secondaryButtonText={m.cancel()}
  on:close={modal.close}
  on:click:button--secondary={modal.close}
  on:submit={modal.executeExport}
  on:open
  size="sm"
  class="download-modal"
>
  {#if modal.isOpen}
    <div class="export-layout">
      <section class="export-panel">
        {#if modal.selectedTab === ExportTab.PROJECT}
          <div class="panel-heading">
            <p class="panel-description">{m.download_project_description()}</p>
          </div>

          <div class="project-name-field">
            <TextInput
              light
              labelText={m.download_project_name()}
              value={modal.fileName}
              placeholder={m.project_placeholder()}
              on:input={(e) => modal.setFileName(String(e.detail ?? ''))}
            />
          </div>
        {:else if modal.selectedTab === ExportTab.MAP}
          <div class="panel-heading">
            <p class="panel-description">{m.download_map_description()}</p>
          </div>

          <RadioButtonGroup
            legendText={m.download_tab_map()}
            hideLegend
            name="map-export-format"
            selected={modal.mapFormat}
            on:change={handleMapFormatChange}
          >
            {#each mapFormatOptions as option (option.id)}
              <RadioButton value={option.id} labelText={option.label} />
            {/each}
          </RadioButtonGroup>

          <p class="option-note">
            {mapFormatOptions.find((option) => option.id === modal.mapFormat)
              ?.description}
          </p>

          <section class="export-summary" aria-live="polite">
            <p class="summary-heading">{m.download_map_current_page()}</p>
            <dl class="summary-grid">
              <div class="summary-item">
                <dt>{m.download_map_current_format()}</dt>
                <dd>{currentPageFormatLabel}</dd>
              </div>

              <div class="summary-item">
                <dt>{m.download_map_current_size()}</dt>
                <dd>{currentPageSizeLabel}</dd>
              </div>

              {#if modal.mapFormat !== MAP_FORMAT.SVG}
                <div class="summary-item">
                  <dt>{m.download_map_export_size()}</dt>
                  <dd>{selectedExportSizeLabel}</dd>
                </div>
              {/if}
            </dl>
          </section>

          {#if modal.mapFormat !== MAP_FORMAT.SVG}
            <div class="option-section">
              <RadioButtonGroup
                legendText={m.download_map_resolution()}
                name="map-export-resolution"
                selected={modal.resolution}
                on:change={handleResolutionChange}
              >
                {#each resolutionOptions as option (option.id)}
                  <RadioButton value={option.id} labelText={option.label} />
                {/each}
              </RadioButtonGroup>
            </div>
          {/if}
        {:else}
          <div class="panel-heading">
            <p class="panel-description">{m.download_data_description()}</p>
          </div>

          <RadioButtonGroup
            legendText={m.download_tab_data()}
            hideLegend
            name="data-export-format"
            selected={modal.dataFormat}
            orientation="vertical"
            on:change={handleDataFormatChange}
          >
            {#each dataFormatOptions as option (option.id)}
              <RadioButton value={option.id} labelText={option.label} />
            {/each}
          </RadioButtonGroup>
        {/if}
      </section>

      <nav class="export-rail" aria-label={m.download_modal_title()}>
        {#each exportTargets as target (target.id)}
          <Button
            type="button"
            kind="ghost"
            size="small"
            class="export-rail-tab {modal.selectedTab === target.id
              ? 'is-active'
              : ''}"
            aria-current={modal.selectedTab === target.id ? 'page' : undefined}
            title={target.description}
            on:click={() => modal.setTab(target.id as ExportTabType)}
          >
            <span class="export-rail-tab-inner">
              <target.icon size={30} />
              <span class="export-rail-tab-label">{target.label}</span>
            </span>
          </Button>
        {/each}
      </nav>
    </div>
  {/if}
</Modal>

<style>
  :global(html[theme='g100'] #khartis-download-button .bx--btn--primary) {
    background-color: var(--khartis-control-surface-background) !important;
    border-color: var(--cds-border-subtle-01) !important;
    color: var(--cds-text-01) !important;
  }

  :global(html[theme='g100'] #khartis-download-button .bx--btn--primary:hover) {
    background-color: var(
      --khartis-control-surface-hover-background
    ) !important;
    color: var(--cds-text-01) !important;
  }

  :global(html[theme='g100'] #khartis-download-button .bx--btn--primary:focus) {
    border-color: var(--cds-focus) !important;
    box-shadow:
      inset 0 0 0 1px var(--cds-focus),
      inset 0 0 0 2px var(--khartis-control-surface-background) !important;
  }

  :global(
    html[theme='g100'] #khartis-download-button .bx--btn--primary:active
  ) {
    background-color: var(--cds-hover-ui) !important;
    color: var(--cds-text-01) !important;
  }

  :global(
    html[theme='g100'] #khartis-download-button .bx--btn--primary .bx--btn__icon
  ) {
    fill: currentColor !important;
  }

  :global(.download-modal .bx--modal-container),
  :global(.download-modal .bx--modal-header),
  :global(.download-modal .bx--modal-content) {
    background: var(--cds-background, #ffffff);
  }

  @media (min-width: 1024px) {
    :global(.download-modal .bx--modal-container) {
      width: min(38rem, calc(100vw - 2rem));
      max-height: calc(100vh - 3rem);
      border-radius: 0;
    }
  }

  :global(.download-modal .bx--modal-header) {
    margin-bottom: 0;
    padding-block-end: var(--cds-spacing-05);
    border-bottom: 1px solid var(--cds-border-subtle-01);
  }

  :global(.download-modal .bx--modal-content) {
    min-height: 0 !important;
    margin-bottom: 0;
    padding: 0 0 0 var(--cds-spacing-06);
  }

  :global(.download-modal .bx--modal-footer) {
    border-top: 1px solid var(--cds-border-subtle-01);
    background: var(--cds-background, #ffffff);
  }

  @media (max-width: 1023px) {
    #khartis-download-button :global(.bx--btn) {
      min-width: 3rem;
      min-height: 3rem;
      padding-inline: 0.75rem;
      font-size: 0;
    }

    #khartis-download-button :global(.bx--btn__icon) {
      margin-inline-start: 0;
    }
  }

  .export-layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 7rem;
    gap: 0;
    align-items: stretch;
    min-height: 19rem;
  }

  .export-panel {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-04);
    padding: var(--cds-spacing-05) var(--cds-spacing-05) var(--cds-spacing-06) 0;
  }

  .export-rail {
    display: grid;
    grid-template-rows: repeat(3, minmax(0, 1fr));
    min-height: 100%;
    border-left: 1px solid var(--cds-border-subtle-01);
    background: var(--khartis-main-toolbar-background, #f4f4f4);
  }

  :global(.download-modal .bx--btn.export-rail-tab) {
    display: flex;
    align-items: stretch;
    justify-content: center;
    width: 100%;
    max-width: none;
    height: 100%;
    min-height: 5.5rem;
    padding: var(--cds-spacing-04) var(--cds-spacing-03);
    border: 0;
    border-bottom: 1px solid var(--cds-border-subtle-01);
    border-radius: 0;
    background: transparent;
    color: var(--cds-text-secondary, #525252);
    text-align: center;
  }

  :global(.download-modal .bx--btn.export-rail-tab:last-child) {
    border-bottom: 0;
  }

  :global(.download-modal .bx--btn.export-rail-tab:hover) {
    background: var(--cds-layer-hover-01, #e8e8e8);
    color: var(--cds-text-primary, #161616);
  }

  :global(.download-modal .bx--btn.export-rail-tab:focus-visible) {
    outline: 2px solid var(--cds-focus, #0f62fe);
    outline-offset: -2px;
  }

  :global(.download-modal .bx--btn.export-rail-tab.is-active) {
    background: var(
      --khartis-main-toolbar-surface-background,
      var(--cds-background, #ffffff)
    );
    color: var(--cds-text-primary, #161616);
    box-shadow: none;
  }

  .export-rail-tab-inner {
    display: flex;
    flex: 1;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.35rem;
  }

  .export-rail-tab-label {
    font-size: 12px;
    font-weight: 400;
    line-height: 1.2;
  }

  :global(.download-modal .bx--btn.export-rail-tab svg) {
    flex-shrink: 0;
    fill: currentColor;
  }

  :global(.download-modal .bx--radio-button-group) {
    column-gap: var(--cds-spacing-06);
    row-gap: var(--cds-spacing-03);
  }

  .panel-heading {
    display: grid;
    gap: var(--cds-spacing-02);
  }

  .panel-description {
    margin: 0;
    color: var(--cds-text-secondary, #525252);
    font-size: 0.8125rem;
    line-height: 1.55;
  }

  .project-name-field {
    width: min(100%, 24rem);
  }

  .option-section {
    display: grid;
    gap: var(--cds-spacing-03);
  }

  .option-note {
    max-width: 34rem;
    margin: calc(var(--cds-spacing-02) * -1) 0 0;
    color: var(--cds-text-secondary, #525252);
    font-size: 0.75rem;
    line-height: 1.45;
  }

  .export-summary {
    display: grid;
    gap: var(--cds-spacing-03);
    padding: var(--cds-spacing-04);
    border-left: 3px solid var(--cds-border-strong-01, #8d8d8d);
    background: var(--cds-layer-01, #f4f4f4);
  }

  .summary-heading {
    margin: 0;
    color: var(--cds-text-primary, #161616);
    font-size: 0.8125rem;
    font-weight: 600;
  }

  .summary-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(7rem, 1fr));
    gap: var(--cds-spacing-05);
    margin: 0;
  }

  .summary-item {
    display: grid;
    gap: 0.25rem;
  }

  .summary-item dt {
    font-size: 0.75rem;
    color: var(--cds-text-secondary, #525252);
  }

  .summary-item dd {
    margin: 0;
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--cds-text-primary, #161616);
  }

  @media (max-width: 671px) {
    :global(.download-modal .bx--modal-content) {
      padding-inline: var(--cds-spacing-05);
      padding-block-end: var(--cds-spacing-05);
    }

    .export-layout {
      grid-template-columns: 1fr;
      gap: var(--cds-spacing-04);
    }

    .export-rail {
      order: -1;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      grid-template-rows: auto;
      border-left: 0;
      border-bottom: 1px solid var(--cds-border-subtle-01);
    }

    .export-panel {
      padding: var(--cds-spacing-04) 0 0;
    }

    :global(.download-modal .bx--btn.export-rail-tab) {
      min-height: 4.25rem;
      border-right: 1px solid var(--cds-border-subtle-01);
      border-bottom: 0;
    }

    :global(.download-modal .bx--btn.export-rail-tab:last-child) {
      border-right: 0;
    }

    :global(.download-modal .bx--btn.export-rail-tab.is-active) {
      box-shadow: none;
    }

    .export-rail-tab-inner {
      gap: 0.25rem;
    }

    :global(.download-modal .bx--btn.export-rail-tab svg) {
      width: 1.25rem;
      height: 1.25rem;
    }

    .export-rail-tab-label {
      font-size: 12px;
    }

    .summary-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
