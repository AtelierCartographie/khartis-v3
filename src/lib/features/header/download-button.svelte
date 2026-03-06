<script lang="ts">
  import Button from '$lib/features/commons/components/carbon/button.svelte';
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
  import { MAP_FORMAT, DATA_FORMAT, EXPORT_RESOLUTION } from './types';
  import type {
    MapExportFormat,
    DataExportFormat,
    ExportTabType,
    ExportResolution
  } from './types';

  const modal = useExportModal();
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
                    <RadioTile light value={MAP_FORMAT.PNG}
                      >{m.download_map_png()}</RadioTile
                    >
                    <RadioTile light value={MAP_FORMAT.JPG}
                      >{m.download_map_jpg()}</RadioTile
                    >
                  </TileGroup>

                  {#if modal.mapFormat !== MAP_FORMAT.SVG}
                    <FormGroup legendText={m.download_map_resolution()}>
                      <TileGroup
                        selected={modal.resolution}
                        on:select={(e) =>
                          modal.setResolution(e.detail as ExportResolution)}
                      >
                        <RadioTile light value={EXPORT_RESOLUTION.HD_1080P}
                          >{m.download_resolution_1080p()}</RadioTile
                        >
                        <RadioTile light value={EXPORT_RESOLUTION.QHD_2K}
                          >{m.download_resolution_2k()}</RadioTile
                        >
                        <RadioTile light value={EXPORT_RESOLUTION.UHD_4K}
                          >{m.download_resolution_4k()}</RadioTile
                        >
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

  header {
    margin-bottom: 1rem;
  }
</style>
