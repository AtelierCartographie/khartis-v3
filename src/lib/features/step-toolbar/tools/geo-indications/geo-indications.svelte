<script lang="ts">
  import { Column, Grid, Row } from 'carbon-components-svelte';
  import ScaleSection from './scale-section.svelte';
  import OrientationSection from './orientation-section.svelte';
  import InsetMapSection from './inset-map-section.svelte';
</script>

<div id="khartis-geo-indications-tool">
  <Grid padding noGutter fullWidth>
    <Row>
      <Column></Column>
    </Row>
  </Grid>

  <div class="expandable-stack">
    <ScaleSection />
    <OrientationSection />
    <InsetMapSection />
  </div>
</div>

<style>
  #khartis-geo-indications-tool .expandable-stack :global(.section-container) {
    margin-bottom: 0;
  }

  #khartis-geo-indications-tool
    .expandable-stack
    :global(.section-container + .section-container) {
    border-top: 0;
  }

  #khartis-geo-indications-tool :global(.bx--slider-container) {
    width: 100%;
  }

  #khartis-geo-indications-tool :global(.bx--slider) {
    min-width: auto !important;
    max-width: none !important;
    flex: 1;
    margin: 0 0.5rem;
  }

  #khartis-geo-indications-tool :global(.bx--slider__track) {
    background: var(--cds-ui-03);
  }

  #khartis-geo-indications-tool :global(.bx--slider__filled-track) {
    background: var(--cds-text-01);
  }

  #khartis-geo-indications-tool :global(.bx--slider-text-input) {
    width: 3.5rem !important;
    min-width: 3.5rem !important;
    flex-shrink: 0;
    text-align: center;
  }

  #khartis-geo-indications-tool :global(.bx--slider__range-label) {
    min-width: 2rem;
    font-size: 0.75rem;
  }
</style>
