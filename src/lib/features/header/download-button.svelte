<script lang="ts">
  import Button from '$lib/features/commons/components/carbon/button.svelte';
  import {
    FormatMode,
    PageModel
  } from '$lib/features/commons/constants/ui.constants';
  import { getFormatState } from '$lib/features/step-toolbar/tools/format/format.store.svelte';
  import { m } from '$lib/paraglide/messages.js';
  import {
    Column,
    FormGroup,
    Grid,
    Modal,
    RadioTile,
    Row,
    Tab,
    TabContent,
    Tabs,
    TextInput,
    TileGroup
  } from 'carbon-components-svelte';
  import { Download } from 'carbon-icons-svelte';
  import { useExportModal } from './hooks';
  import {
    MAP_FORMAT,
    DATA_FORMAT,
    EXPORT_RESOLUTION,
    formatExportDimensions,
    getExportDimensionsForPage
  } from './types';
  import type {
    MapExportFormat,
    DataExportFormat,
    ExportTabType,
    ExportResolution
  } from './types';

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
    <div class="content-wrapper">
      <Tabs
        autoWidth
        on:change={(e) => modal.setTab(e.detail as ExportTabType)}
      >
        <Tab label={m.download_tab_project()} />
        <Tab label={m.download_tab_map()} />
        <Tab label={m.download_tab_data()} />

        <svelte:fragment slot="content">
          <TabContent>
            <Grid noGutter>
              <Row>
                <Column>
                  <header>
                    <p class="grey-text">
                      {m.download_project_description()}
                    </p>
                  </header>

                  <FormGroup legendText={m.download_project_name()}>
                    <TextInput
                      value={modal.fileName}
                      placeholder={m.project_placeholder()}
                      on:input={(e) =>
                        modal.setFileName(String(e.detail ?? ''))}
                    />
                  </FormGroup>
                </Column>
              </Row>
            </Grid>
          </TabContent>

          <TabContent>
            <Grid noGutter>
              <Row>
                <Column>
                  <header>
                    <p class="grey-text">
                      {m.download_map_description()}
                    </p>
                  </header>

                  <TileGroup
                    selected={modal.mapFormat}
                    on:select={(e) =>
                      modal.setMapFormat(e.detail as MapExportFormat)}
                  >
                    <RadioTile light value={MAP_FORMAT.SVG}
                      >{m.download_map_svg()}</RadioTile
                    >
                    <RadioTile light value={MAP_FORMAT.JPG}
                      >{m.download_map_jpg()}</RadioTile
                    >
                  </TileGroup>

                  <section class="map-export-summary" aria-live="polite">
                    <p class="summary-heading">
                      {m.download_map_current_page()}
                    </p>

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

                    <p class="summary-note grey-text">
                      {#if modal.mapFormat === MAP_FORMAT.SVG}
                        {m.download_map_svg_note()}
                      {:else}
                        {m.download_map_jpg_note()}
                      {/if}
                    </p>
                  </section>

                  {#if modal.mapFormat !== MAP_FORMAT.SVG}
                    <FormGroup legendText={m.download_map_resolution()}>
                      <TileGroup
                        selected={modal.resolution}
                        on:select={(e) =>
                          modal.setResolution(e.detail as ExportResolution)}
                      >
                        <RadioTile light value={EXPORT_RESOLUTION.HD_1080P}>
                          <span class="resolution-option-label"
                            >{m.download_resolution_1080p()}</span
                          >
                          <span class="resolution-option-size"
                            >{exportSize1080pLabel}</span
                          >
                        </RadioTile>
                        <RadioTile light value={EXPORT_RESOLUTION.QHD_2K}>
                          <span class="resolution-option-label"
                            >{m.download_resolution_2k()}</span
                          >
                          <span class="resolution-option-size"
                            >{exportSize2kLabel}</span
                          >
                        </RadioTile>
                        <RadioTile light value={EXPORT_RESOLUTION.UHD_4K}>
                          <span class="resolution-option-label"
                            >{m.download_resolution_4k()}</span
                          >
                          <span class="resolution-option-size"
                            >{exportSize4kLabel}</span
                          >
                        </RadioTile>
                      </TileGroup>
                    </FormGroup>
                  {/if}
                </Column>
              </Row>
            </Grid>
          </TabContent>

          <TabContent>
            <Grid noGutter>
              <Row>
                <Column>
                  <header>
                    <p class="grey-text">
                      {m.download_data_description()}
                    </p>
                  </header>

                  <TileGroup
                    name="plan-disabled"
                    selected={modal.dataFormat}
                    on:select={(e) =>
                      modal.setDataFormat(e.detail as DataExportFormat)}
                  >
                    <RadioTile light value={DATA_FORMAT.CSV}
                      >{m.download_data_csv()}</RadioTile
                    >
                    <RadioTile light value={DATA_FORMAT.CSV_GEO}
                      >{m.download_data_csv_geo()}</RadioTile
                    >
                    <RadioTile light value={DATA_FORMAT.GEOJSON}
                      >{m.download_data_geojson()}</RadioTile
                    >
                  </TileGroup>
                </Column>
              </Row>
            </Grid>
          </TabContent>
        </svelte:fragment>
      </Tabs>
    </div>
  {/if}
</Modal>

<style>
  #khartis-download-button :global(.download-modal .bx--modal-content) {
    min-height: 380px !important;
    margin-bottom: var(--cds-spacing-05);
  }

  @media (max-width: 1023px) {
    #khartis-download-button :global(.bx--btn) {
      min-width: 3rem;
      padding-inline: 0.75rem;
      font-size: 0;
    }

    #khartis-download-button :global(.bx--btn__icon) {
      margin-inline-start: 0;
    }
  }

  header {
    margin-bottom: 1rem;
  }

  .map-export-summary {
    margin-block: 1rem;
    padding: 0.875rem 1rem;
    border: 1px solid var(--cds-border-subtle);
    border-radius: 0.5rem;
    background: var(--cds-layer-accent-01, #f4f4f4);
  }

  .summary-heading {
    margin: 0 0 0.75rem;
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--cds-text-primary, #161616);
  }

  .summary-grid {
    display: grid;
    gap: 0.75rem;
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

  .summary-note {
    margin: 0.75rem 0 0;
    font-size: 0.75rem;
    line-height: 1.4;
  }

  .resolution-option-label,
  .resolution-option-size {
    display: block;
  }

  .resolution-option-size {
    margin-top: 0.25rem;
    font-size: 0.75rem;
    color: var(--cds-text-secondary, #525252);
  }
</style>
