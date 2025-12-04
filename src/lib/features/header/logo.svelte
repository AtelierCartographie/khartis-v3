<script>
  import logoKhartis from '$lib/features/commons/assets/images/logos/logo-khartis-desktop.svg';
  import logoSciencesPo from '$lib/features/commons/assets/images/logos/logo-sciences-po-desktop.svg';
  import { m } from '$lib/paraglide/messages.js';
  import { Column, Grid, Row } from 'carbon-components-svelte';
  import Separator from '../commons/components/separator.svelte';
  import { EnvironmentUtils } from '../commons/utils/environment.utils';

  const isNotProduction = $state(!EnvironmentUtils.isProduction());
</script>

<div id="khartis-logo">
  <Grid fullWidth noGutter padding={false}>
    <Row>
      <Column class="logo-column">
        <img
          class="sciences-po-logo"
          class:preprod={isNotProduction}
          src={logoSciencesPo}
          width={100}
          alt={m.logo_sciences_po_alt()}
        />
      </Column>

      <Column noGutter>
        <Separator orientation="vertical" class="full-height" />
      </Column>

      <Column class="logo-column">
        <img
          src={logoKhartis}
          width={90}
          alt={m.logo_khartis_alt()}
          class="khartis-logo"
        />
      </Column>
    </Row>
  </Grid>
</div>

<style lang="scss">
  #khartis-logo :global(.logo-column) {
    display: flex;
    align-items: center;
  }

  .sciences-po-logo {
    margin: auto;

    &.preprod {
      filter: hue-rotate(90deg) saturate(1.5);
    }
  }

  #khartis-logo :global(.full-height) {
    height: 100%;
  }

  :global(html[theme='g100']) .khartis-logo,
  :global(html[theme='g100']) .sciences-po-logo:not(.preprod) {
    filter: invert(1);
  }
</style>
