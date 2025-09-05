<script lang="ts">
  import { m } from '$lib/paraglide/messages.js';
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

  let open = false;

  let selectedTabIndex = 0;
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
                  <TextInput placeholder={m.project_placeholder()} />
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

                <TileGroup selected="svg">
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

                <TileGroup name="plan-disabled" selected="csv">
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
