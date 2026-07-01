<script>
  import logoKhartis from '$lib/features/commons/assets/images/logos/logo-khartis-desktop.svg';
  import logoSciencesPo from '$lib/features/commons/assets/images/logos/logo-sciences-po-desktop.svg';
  import { m } from '$lib/paraglide/messages.js';
  import { Column, Grid, Row, Tag } from 'carbon-components-svelte';
  import Separator from '../../commons/components/separator.svelte';
  import { EnvironmentUtils } from '../../commons/utils/environment.utils';

  const isNotProduction = !EnvironmentUtils.isProduction();
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
          height={16}
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
        <Tag
          type="blue"
          size="sm"
          class="beta-tag"
          title={m.logo_beta_tag_label()}
        >
          {m.logo_beta_tag()}
        </Tag>
      </Column>
    </Row>
  </Grid>
</div>

<style lang="scss">
  #khartis-logo :global(.logo-column) {
    display: flex;
    align-items: center;
  }

  #khartis-logo :global(.beta-tag) {
    flex-shrink: 0;
    margin: 0 0 0 var(--cds-spacing-02);
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

  @media (max-width: 1023px) {
    .sciences-po-logo {
      width: 76px;
      height: auto;
    }

    .khartis-logo {
      width: 68px;
      height: auto;
    }
  }

  @media (max-width: 639px) {
    .sciences-po-logo {
      width: 58px;
    }

    .khartis-logo {
      width: 54px;
    }

    :global(.beta-tag) {
      display: none;
    }
  }
</style>
