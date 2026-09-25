<script>
  import logoKhartis from '$lib/features/commons/assets/images/logos/logo-khartis-desktop.svg';
  import logoSciencesPo from '$lib/features/commons/assets/images/logos/logo-sciences-po-desktop.svg';
  import { m } from '$lib/paraglide/messages';
  import { Tag } from 'carbon-components-svelte';
  import Separator from './separator.svelte';
  import { EnvironmentUtils } from '../utils/environment.utils';

  const isNotProduction = !EnvironmentUtils.isProduction();
</script>

<div id="khartis-logo">
  <img
    class="sciences-po-logo"
    class:preprod={isNotProduction}
    src={logoSciencesPo}
    width={100}
    height={16}
    alt={m.logo_sciences_po_alt()}
  />

  <Separator orientation="vertical" class="full-height" />

  <div class="khartis-logo-group">
    <img
      src={logoKhartis}
      width={90}
      alt={m.logo_khartis_alt()}
      class="khartis-logo"
    />
    <Tag type="blue" size="sm" class="beta-tag" title={m.logo_beta_tag_label()}>
      {m.logo_beta_tag()}
    </Tag>
  </div>
</div>

<style lang="scss">
  #khartis-logo {
    display: flex;
    align-items: center;
    height: 100%;
    padding-inline: var(--cds-spacing-05);
    gap: var(--cds-spacing-04);
  }

  .khartis-logo-group {
    display: flex;
    align-items: center;
    flex-shrink: 0;
  }

  #khartis-logo :global(.beta-tag) {
    flex-shrink: 0;
    margin: 4px 0 0 var(--cds-spacing-02);
  }

  .sciences-po-logo {
    &.preprod {
      filter: hue-rotate(90deg) saturate(1.5);
    }
  }

  #khartis-logo :global(.full-height) {
    height: auto;
    align-self: stretch;
    flex-shrink: 0;
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
    .sciences-po-logo,
    #khartis-logo :global(.full-height) {
      display: none;
    }
  }

  // Below ~757px the centered project-title input overlaps the logo area
  // once the beta tag is included; hide the tag rather than the logo.
  @media (max-width: 767px) {
    #khartis-logo :global(.beta-tag) {
      display: none;
    }
  }
</style>
