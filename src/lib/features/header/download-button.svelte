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

  function handleModalOpen() {
    exportFileName = projectStore.projectName || 'untitled';
    logger.info('Download modal opened', LogCategory.EXPORT, {
      currentProjectName: projectStore.projectName,
      exportFileName,
      datasetCount: datasetsStore.datasets.length,
      isMapLoaded: mapInstanceStore.isMapLoaded
    });
    open = true;
  }

  function handleModalClose() {
    logger.debug('Download modal closed', LogCategory.EXPORT);
    open = false;
  }

  function handleTabChange(tabIndex: number) {
    const tabName =
      tabIndex === ExportTab.PROJECT
        ? 'PROJECT'
        : tabIndex === ExportTab.MAP
          ? 'MAP'
          : 'DATA';
    logger.debug('Export tab changed', LogCategory.EXPORT, {
      from: selectedTabIndex,
      to: tabIndex,
      tabName
    });
    selectedTabIndex = tabIndex;
  }

  function handleMapFormatChange(format: MapExportFormat) {
    logger.debug('Map export format changed', LogCategory.EXPORT, {
      from: selectedMapFormat,
      to: format
    });
    selectedMapFormat = format;
  }

  function handleDataFormatChange(format: DataExportFormat) {
    logger.debug('Data export format changed', LogCategory.EXPORT, {
      from: selectedDataFormat,
      to: format
    });
    selectedDataFormat = format;
  }

  function handleFileNameChange(value: string) {
    logger.debug('Export filename changed', LogCategory.EXPORT, {
      from: exportFileName,
      to: value
    });
    exportFileName = value;
  }

  async function handleDownload() {
    const exportContext = {
      tab: selectedTabIndex,
      tabName:
        selectedTabIndex === ExportTab.PROJECT
          ? 'PROJECT'
          : selectedTabIndex === ExportTab.MAP
            ? 'MAP'
            : 'DATA',
      fileName: exportFileName,
      mapFormat: selectedMapFormat,
      dataFormat: selectedDataFormat,
      hasProject: !!projectStore.currentProject,
      datasetCount: datasetsStore.datasets.length,
      isMapLoaded: mapInstanceStore.isMapLoaded,
      visualizationCount: visualizationStore.activeVisualizations?.length ?? 0
    };

    logger.info('Export started', LogCategory.EXPORT, exportContext);

    if (exportFileName !== projectStore.projectName) {
      logger.debug('Updating project name', LogCategory.EXPORT, {
        from: projectStore.projectName,
        to: exportFileName
      });
      projectStore.updateProjectName(exportFileName);
    }

    isExporting = true;
    try {
      switch (selectedTabIndex) {
        case ExportTab.PROJECT:
          logger.debug('Exporting project', LogCategory.EXPORT, {
            projectId: projectStore.currentProject?.id,
            fileName: exportFileName
          });
          if (projectStore.currentProject) {
            await projectStore.exportProject(exportFileName);
            logger.success('Project exported successfully', LogCategory.EXPORT);
          } else {
            logger.warn('No project to export', LogCategory.EXPORT);
          }
          break;

        case ExportTab.MAP:
          if (!mapInstanceStore.isMapLoaded) {
            logger.error(
              'Map export failed: map not loaded',
              LogCategory.EXPORT,
              {
                mapInstanceState: {
                  isMapLoaded: mapInstanceStore.isMapLoaded
                }
              }
            );
            showError(m.export_map_error(), m.export_map_not_loaded());
            break;
          }

          if (datasetsStore.datasets.length === 0) {
            logger.error('Map export failed: no datasets', LogCategory.EXPORT);
            showError(m.export_map_error(), m.export_map_no_data());
            break;
          }

          try {
            logger.debug(
              'Normalizing datasets for map export',
              LogCategory.EXPORT,
              {
                datasetCount: datasetsStore.datasets.length,
                datasetIds: datasetsStore.datasets.map((d) => d.id)
              }
            );

            const processedDatasets = normalizeDatasets(datasetsStore.datasets);

            logger.debug('Datasets normalized', LogCategory.EXPORT, {
              processedCount: processedDatasets.length,
              geometryTypes: processedDatasets.map((d) => d.geometry)
            });

            let blob: Blob;

            if (selectedMapFormat === MAP_FORMAT.SVG) {
              logger.debug('Generating SVG export', LogCategory.EXPORT, {
                visualizations: visualizationStore.activeVisualizations?.map(
                  (v) => ({
                    id: v.id,
                    type: v.type
                  })
                )
              });

              blob = exportMapToSvg(
                processedDatasets,
                visualizationStore.activeVisualizations
              );

              logger.debug('SVG blob created', LogCategory.EXPORT, {
                blobSize: blob.size,
                blobType: blob.type
              });

              const filename = generateExportFilename(
                exportFileName,
                MAP_FORMAT.SVG
              );
              downloadFile(blob, filename);
              logger.success('SVG export completed', LogCategory.EXPORT, {
                filename
              });
            } else if (selectedMapFormat === MAP_FORMAT.JPG) {
              logger.debug('Generating JPG export', LogCategory.EXPORT, {
                visualizations: visualizationStore.activeVisualizations?.map(
                  (v) => ({
                    id: v.id,
                    type: v.type
                  })
                )
              });

              blob = await exportMapToJpg(
                processedDatasets,
                visualizationStore.activeVisualizations
              );

              logger.debug('JPG blob created', LogCategory.EXPORT, {
                blobSize: blob.size,
                blobType: blob.type
              });

              const filename = generateExportFilename(
                exportFileName,
                MAP_FORMAT.JPG
              );
              downloadFile(blob, filename);
              logger.success('JPG export completed', LogCategory.EXPORT, {
                filename
              });
            }
          } catch (mapExportError) {
            const errorDetails = {
              errorName:
                mapExportError instanceof Error
                  ? mapExportError.name
                  : 'Unknown',
              errorMessage:
                mapExportError instanceof Error
                  ? mapExportError.message
                  : String(mapExportError),
              errorStack:
                mapExportError instanceof Error
                  ? mapExportError.stack
                  : undefined,
              format: selectedMapFormat,
              datasetCount: datasetsStore.datasets.length
            };
            logger.error('Map export failed', LogCategory.EXPORT, errorDetails);
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

            logger.debug('Exporting data', LogCategory.EXPORT, {
              format,
              extension,
              datasetCount: datasetsStore.datasets.length,
              datasetIds: datasetsStore.datasets.map((d) => d.id)
            });

            try {
              const normalizedDatasets = normalizeDatasets(
                datasetsStore.datasets
              );
              logger.debug(
                'Datasets normalized for data export',
                LogCategory.EXPORT,
                {
                  normalizedCount: normalizedDatasets.length
                }
              );

              const blob = await exportProcessedDatasets(
                normalizedDatasets,
                format
              );
              logger.debug('Data blob created', LogCategory.EXPORT, {
                blobSize: blob.size,
                blobType: blob.type
              });

              const filename = generateExportFilename(
                exportFileName,
                extension
              );
              downloadFile(blob, filename);
              logger.success('Data export completed', LogCategory.EXPORT, {
                filename,
                format
              });
            } catch (dataExportError) {
              const errorDetails = {
                errorName:
                  dataExportError instanceof Error
                    ? dataExportError.name
                    : 'Unknown',
                errorMessage:
                  dataExportError instanceof Error
                    ? dataExportError.message
                    : String(dataExportError),
                errorStack:
                  dataExportError instanceof Error
                    ? dataExportError.stack
                    : undefined,
                format,
                datasetCount: datasetsStore.datasets.length
              };
              logger.error(
                'Data export failed',
                LogCategory.EXPORT,
                errorDetails
              );
              showError(
                m.export_data_error(),
                dataExportError instanceof Error
                  ? dataExportError.message
                  : m.export_unknown_error()
              );
              break;
            }
          } else {
            logger.error(
              'Data export failed: no datasets available',
              LogCategory.EXPORT
            );
            showError(m.export_data_error(), m.export_data_no_data());
          }
          break;
      }

      open = false;
      logger.info('Export modal closed', LogCategory.EXPORT);
    } catch (error) {
      const errorDetails = {
        errorName: error instanceof Error ? error.name : 'Unknown',
        errorMessage: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined,
        context: exportContext
      };
      logger.error(
        'Export failed with unexpected error',
        LogCategory.EXPORT,
        errorDetails
      );
      showError(
        m.export_error(),
        error instanceof Error ? error.message : m.export_unknown_error()
      );
    } finally {
      isExporting = false;
      logger.debug('Export process finished', LogCategory.EXPORT, {
        isExporting: false
      });
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
    on:click={handleModalOpen}
  >
    {m.download_button()}
  </Button>
</div>

<Modal
  primaryButtonDisabled={isExporting}
  secondaryButtonDisabled={isExporting}
  open={open}
  modalHeading={m.download_modal_title()}
  primaryButtonText={isExporting ? m.download_exporting() : m.download_button()}
  on:close={handleModalClose}
  on:click:button--secondary={handleModalClose}
  on:submit={handleDownload}
  on:open
  size="sm"
  class="download-modal"
>
  {#if open}
    <div class="content-wrapper">
      <Tabs autoWidth on:change={(e) => handleTabChange(e.detail)}>
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
                      value={exportFileName}
                      placeholder={m.project_placeholder()}
                      on:input={(e) =>
                        handleFileNameChange(String(e.detail ?? ''))}
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
                    selected={selectedMapFormat}
                    on:select={(e) =>
                      handleMapFormatChange(e.detail as MapExportFormat)}
                  >
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
                    selected={selectedDataFormat}
                    on:select={(e) =>
                      handleDataFormatChange(e.detail as DataExportFormat)}
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
