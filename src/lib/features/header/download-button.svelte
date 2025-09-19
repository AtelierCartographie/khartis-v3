<script lang="ts">
  import { m } from '$lib/paraglide/messages.js';
  import { projectStore } from '$lib/features/commons/store/project.store.svelte';
  import { slugify } from '$lib/features/commons/utils/string.utils';
  import {
    exportProjectData,
    downloadFile,
    generateExportFilename
  } from '$lib/features/commons/utils/file-export.utils';
  import { showError } from '$lib/features/commons/utils/notification.utils.svelte';
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
      projectStore.updateProjectName(exportFileName);
    }

    try {
      switch (selectedTabIndex) {
        case 0:
          if (projectStore.currentProject) {
            await projectStore.exportProject(exportFileName);
          }
          break;

        case 1:
          showError('Export carte', 'Fonctionnalité en cours de développement');
          break;

        case 2:
          if (projectStore.currentProject?.data?.sourceFiles) {
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

            const blob = await exportProjectData(
              projectStore.currentProject.data.sourceFiles,
              format
            );
            const filename = generateExportFilename(exportFileName, extension);
            downloadFile(blob, filename);
          } else {
            showError('Export données', 'Aucune donnée à exporter');
          }
          break;
      }

      open = false;
    } catch (error) {
      showError(
        'Erreur export',
        error instanceof Error ? error.message : 'Erreur inconnue'
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
