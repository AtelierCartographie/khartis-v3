<script lang="ts">
  import { m } from '$lib/paraglide/messages.js';
  import { projectStore } from '$lib/features/commons/store/project.store.svelte';
  import { datasetsStore } from '$lib/features/commons/store/datasets.store.svelte';
  import { visualizationStore } from '$lib/features/commons/store/visualization.store.svelte';
  import { mapInstanceStore } from '$lib/features/commons/store/map-instance.store.svelte';
  import {
    exportProcessedDatasets,
    downloadFile,
    generateExportFilename
  } from '$lib/features/commons/utils/file-export.utils';
  import {
    exportMapToSvg,
    exportMapToJpg
  } from '$lib/features/commons/utils/map-export.utils';
  import { showError } from '$lib/features/commons/utils/notification.utils.svelte';
  import { logger, LogCategory } from '$lib/features/commons/utils/logger';
  import { normalizeDatasets } from '$lib/features/data-pipeline/utils/processed-dataset.utils';
  import {
    Button,
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

  type MapExportFormat = 'svg' | 'jpg';
  type DataExportFormat = 'csv' | 'geojson' | 'csv-geo';

  const ExportTab = {
    PROJECT: 0,
    MAP: 1,
    DATA: 2
  } as const;

  const MAP_FORMAT = {
    SVG: 'svg',
    JPG: 'jpg'
  } as const;

  const DATA_FORMAT = {
    CSV: 'csv',
    GEOJSON: 'geojson',
    CSV_GEO: 'csv-geo'
  } as const;

  let open = $state(false);
  let selectedTabIndex = $state<number>(ExportTab.PROJECT);
  let exportFileName = $state(projectStore.projectName || 'untitled');
  let selectedMapFormat = $state<MapExportFormat>(MAP_FORMAT.SVG);
  let selectedDataFormat = $state<DataExportFormat>(DATA_FORMAT.CSV);
  let isExporting = $state(false);

  async function handleDownload() {
    if (exportFileName !== projectStore.projectName) {
      projectStore.updateProjectName(exportFileName);
    }

    isExporting = true;
    try {
      switch (selectedTabIndex) {
        case ExportTab.PROJECT:
          if (projectStore.currentProject) {
            await projectStore.exportProject(exportFileName);
          }
          break;

        case ExportTab.MAP:
          if (!mapInstanceStore.isMapLoaded) {
            logger.error('Map not loaded for export', LogCategory.EXPORT);
            showError(m.export_map_error(), m.export_map_not_loaded());
            break;
          }

          if (datasetsStore.datasets.length === 0) {
            logger.error('No data to export', LogCategory.EXPORT);
            showError(m.export_map_error(), m.export_map_no_data());
            break;
          }

          try {
            let blob: Blob;
            const processedDatasets = normalizeDatasets(datasetsStore.datasets);

            if (selectedMapFormat === MAP_FORMAT.SVG) {
              blob = exportMapToSvg(
                processedDatasets,
                visualizationStore.activeVisualizations
              );
              const filename = generateExportFilename(
                exportFileName,
                MAP_FORMAT.SVG
              );
              downloadFile(blob, filename);
            } else if (selectedMapFormat === MAP_FORMAT.JPG) {
              blob = await exportMapToJpg(
                processedDatasets,
                visualizationStore.activeVisualizations
              );
              const filename = generateExportFilename(
                exportFileName,
                MAP_FORMAT.JPG
              );
              downloadFile(blob, filename);
            }
          } catch (mapExportError) {
            logger.error(
              'Map export failed',
              LogCategory.EXPORT,
              mapExportError
            );
            showError(
              m.export_map_error(),
              mapExportError instanceof Error
                ? mapExportError.message
                : m.export_unknown_error()
            );
            break;
          }
          break;

        case ExportTab.DATA:
          if (datasetsStore.datasets.length > 0) {
            let format: 'csv' | 'geojson' | 'json';
            let extension: string;

            switch (selectedDataFormat) {
              case DATA_FORMAT.CSV:
                format = 'csv';
                extension = 'csv';
                break;

              case DATA_FORMAT.GEOJSON:
                format = 'geojson';
                extension = 'geojson';
                break;

              case DATA_FORMAT.CSV_GEO:
                format = 'json';
                extension = 'json';
                break;

              default:
                format = 'json';
                extension = 'json';
            }

            const blob = await exportProcessedDatasets(
              normalizeDatasets(datasetsStore.datasets),
              format
            );
            const filename = generateExportFilename(exportFileName, extension);
            downloadFile(blob, filename);
          } else {
            logger.error('No data to export', LogCategory.EXPORT);
            showError(m.export_data_error(), m.export_data_no_data());
          }
          break;
      }

      open = false;
    } catch (error) {
      logger.error('Export failed', LogCategory.EXPORT, error);
      showError(
        m.export_error(),
        error instanceof Error ? error.message : m.export_unknown_error()
      );
    } finally {
      isExporting = false;
    }
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
    on:click={() => (open = true)}
  >
    {m.download_button()}
  </Button>
</div>

<Modal
  primaryButtonDisabled={isExporting}
  secondaryButtonDisabled={isExporting}
  bind:open={open}
  modalHeading={m.download_modal_title()}
  primaryButtonText={isExporting ? m.download_exporting() : m.download_button()}
  on:click:button--secondary={() => (open = false)}
  on:submit={handleDownload}
  on:open
  size="sm"
  class="download-modal"
>
  <div class="content-wrapper">
    <Tabs autoWidth bind:selected={selectedTabIndex}>
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
                    bind:value={exportFileName}
                    placeholder={m.project_placeholder()}
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

                <TileGroup bind:selected={selectedMapFormat}>
                  <RadioTile light value={MAP_FORMAT.SVG}
                    >{m.download_map_svg()}</RadioTile
                  >

                  <RadioTile light value={MAP_FORMAT.JPG}
                    >{m.download_map_jpg()}</RadioTile
                  >
                </TileGroup>
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
                  bind:selected={selectedDataFormat}
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
