<script lang="ts">
  import * as m from '$lib/paraglide/messages';
  import Separator from '$lib/features/commons/components/separator.svelte';
  import { Button, Column, Grid, Row } from 'carbon-components-svelte';
  import { Map } from 'carbon-icons-svelte';
</script>

<section>
  <header class="step-header">
    <h5>{m.step3_title()}</h5>
    <p class="kh-help">{m.step3_description()}</p>
    <Separator orientation="horizontal" />
  </header>

  <Grid noGutter fullWidth>
    <Row>
      <Column sm={4} md={8} lg={16}>
        <div class="basemap-placeholder">
          <div class="placeholder-content">
            <Map size={32} />
            <p class="placeholder-text">{m.basemap_available_after_geo()}</p>
            <Button kind="tertiary" disabled size="field">
              {m.customize_basemap()}
            </Button>
          </div>
        </div>
      </Column>
    </Row>
  </Grid>
</section>

<style lang="scss">
  .step-header {
    margin-bottom: var(--cds-spacing-05);

    h5 {
      margin-bottom: var(--cds-spacing-03);
      font-weight: 600;
    }
  }

  .kh-help {
    color: var(--cds-text-02);
    margin-bottom: var(--cds-spacing-05);
    font-size: 0.875rem;
    line-height: 1.4;
  }

  .basemap-placeholder {
    min-height: 200px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--cds-layer-01);
    border: 1px dashed var(--cds-border-subtle);
    border-radius: var(--cds-border-radius);
    padding: var(--cds-spacing-07);
  }

  .placeholder-content {
    text-align: center;
    color: var(--cds-text-02);
  }

  .placeholder-text {
    margin: var(--cds-spacing-05) 0;
    font-size: 0.875rem;
  }
</style>
