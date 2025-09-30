<script lang="ts">
  import { m } from '$lib/paraglide/messages.js';
  import { projectStore } from '$lib/features/commons/store/project.store.svelte';
  import { datasetsStore } from '$lib/features/commons/store/datasets.store.svelte';
  import {
    exportProjectData,
    exportProcessedDatasets,
    downloadFile,
    generateExportFilename
  } from '$lib/features/commons/utils/file-export.utils';
  import { showError } from '$lib/features/commons/utils/notification.utils.svelte';
  import { logger, LogCategory } from '$lib/features/commons/utils/logger';
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

  let open = $state(false);
  let selectedTabIndex = $state(0);
  let exportFileName = $state('');
  let selectedMapFormat = $state('svg');
  let selectedDataFormat = $state('csv');

  $effect(() => {
    exportFileName = projectStore.projectName || 'untitled';
  });

  async function handleDownload() {
    if (exportFileName !== projectStore.projectName) {
      logger.info('Updating project name for export', LogCategory.EXPORT, {
        oldName: projectStore.projectName,
        newName: exportFileName
      });
      projectStore.updateProjectName(exportFileName);
    }

    const tabTypes = ['project', 'map', 'data'];
    logger.info('Starting export', LogCategory.EXPORT, {
      type: tabTypes[selectedTabIndex],
      fileName: exportFileName
    });

    try {
      switch (selectedTabIndex) {
        case 0:
          if (projectStore.currentProject) {
            logger.info('Exporting project', LogCategory.EXPORT, {
              fileName: exportFileName
            });
            await projectStore.exportProject(exportFileName);
            logger.success('Project exported successfully', LogCategory.EXPORT);
          }
          break;

        case 1:
          logger.warn('Map export not yet implemented', LogCategory.EXPORT);
          showError(
            m.export_map_error(),
            m.export_map_feature_in_development()
          );
          break;

        case 2:
          if (datasetsStore.datasets.length > 0) {
            let format: 'csv' | 'geojson' | 'json';
            let extension: string;

            switch (selectedDataFormat) {
              case 'csv':
                format = 'csv';
                extension = 'csv';
                break;
              case 'geojson':
                format = 'geojson';
                extension = 'geojson';
                break;
              case 'csv-geo':
                format = 'json';
                extension = 'json';
                break;
              default:
                format = 'json';
                extension = 'json';
            }

            logger.info('Exporting processed datasets', LogCategory.EXPORT, {
              format,
              extension,
              datasetCount: datasetsStore.datasets.length
            });

            const blob = exportProcessedDatasets(
              datasetsStore.datasets,
              format
            );
            const filename = generateExportFilename(exportFileName, extension);
            downloadFile(blob, filename);
            logger.success('Data exported successfully', LogCategory.EXPORT, {
              filename
            });
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
  primaryButtonText={m.download_button()}
  bind:open={open}
  modalHeading={m.download_modal_title()}
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
                  <RadioTile light value="svg">{m.download_map_svg()}</RadioTile
                  >

                  <RadioTile light value="jpg">{m.download_map_jpg()}</RadioTile
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
                  <RadioTile light value="csv"
                    >{m.download_data_csv()}</RadioTile
                  >
                  <RadioTile light value="csv-geo"
                    >{m.download_data_csv_geo()}</RadioTile
                  >
                  <RadioTile light value="geojson"
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
