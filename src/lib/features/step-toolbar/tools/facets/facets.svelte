<script lang="ts">
  import { m } from '$lib/paraglide/messages';
  import { Button, Column, Grid, Row } from 'carbon-components-svelte';
  import { Launch, SettingsAdjust } from 'carbon-icons-svelte';
  import { toolState } from '../tools-store/tools.store.svelte';

  function handleConfigureVisualization() {
    console.log('Opening visualization configuration');
    console.log('Available variables:', toolState.facets.variables);
    console.log('Selected variables:', toolState.facets.selectedVariables);
  }

  function handleLearnMore() {
    console.log('Opening documentation for map collections');
    window.open('https://docs.khartis.com/facets', '_blank');
  }
</script>

<div id="khartis-facets-tool">
  <Grid noGutter fullWidth>
    <Row>
      <Column>
        <p>{m.facets_description()}</p>
      </Column>
    </Row>

    <Row padding>
      <Column>
        <p>{m.facets_create_instruction()}</p>
      </Column>
    </Row>

    <Row>
      <Column>
        <Button
          kind="ghost"
          icon={Launch}
          iconDescription={m.facets_configure_visualization()}
          onclick={handleLearnMore}
        >
          {m.facets_learn_more()}
        </Button>
      </Column>
    </Row>

    <Row padding>
      <Column>
        <Button
          kind="secondary"
          style="width: 100%;"
          icon={SettingsAdjust}
          iconDescription={m.facets_configure_visualization()}
          onclick={handleConfigureVisualization}
        >
          {m.facets_configure_visualization()}
        </Button>
      </Column>
    </Row>
  </Grid>
</div>

<style>
  #khartis-facets-tool :global(.bx--modal-content) {
    text-align: left;
  }
</style>
