<script lang="ts">
  import { m } from '$lib/paraglide/messages';
  import { Button, Column, Grid, Row } from 'carbon-components-svelte';
  import { Launch, SettingsAdjust } from 'carbon-icons-svelte';

  function handleLearnMore() {
    window.open(
      'https://cartographie.sciencespo.fr/khartis/help/facets',
      '_blank'
    );
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
          disabled
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
