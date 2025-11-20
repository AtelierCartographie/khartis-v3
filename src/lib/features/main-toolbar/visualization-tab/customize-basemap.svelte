<script lang="ts">
  import * as m from '$lib/paraglide/messages';
  import { Column, Grid, Row } from 'carbon-components-svelte';
  import MainToolBarHeader from '../components/main-toolbar-header.svelte';
  import BasemapStyleSelector from './basemap-style-selector.svelte';
</script>

<section id="customize-basemap">
  <MainToolBarHeader title={m.step3_title()} />

  <p class="kh-help">{m.step3_description()}</p>

  <Grid noGutter fullWidth>
    <Row>
      <Column sm={4} md={8} lg={16}>
        <BasemapStyleSelector />
      </Column>
    </Row>
  </Grid>
</section>

<style lang="scss">
  #customize-basemap {
    background-color: var(--cds-ui-02);
    padding: var(--cds-spacing-05);
  }

  .kh-help {
    color: var(--cds-text-02);
    margin-bottom: var(--cds-spacing-05);
    font-size: 0.875rem;
    line-height: 1.4;
  }
</style>
