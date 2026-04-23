<script lang="ts">
  import Button from '$lib/features/commons/components/carbon/button.svelte';
  import { globalState } from '$lib/features/commons/store/global.svelte';
  import { m } from '$lib/paraglide/messages.js';
  import {
    Header as CbsHeader,
    HeaderUtilities
  } from 'carbon-components-svelte';
  import { Help } from 'carbon-icons-svelte';
  import DownloadButton from './download-button.svelte';
  import Logo from './logo.svelte';
  import ProjectTitle from './project-title.svelte';
</script>

<div id="khartis-header">
  <CbsHeader
    href="."
    persistentHamburgerMenu={true}
    bind:isSideNavOpen={globalState.isSideNavOpen}
  >
    <svelte:fragment slot="company">
      <Logo />
    </svelte:fragment>

    <ProjectTitle />

    <HeaderUtilities>
      <Button
        class="header-help-button"
        size="small"
        tooltipPosition="bottom"
        tooltipAlignment="end"
        iconDescription={m.help_tooltip()}
        kind="tertiary"
        icon={Help}
        href="https://www.sciencespo.fr/cartographie/khartis/docs/"
        target="_blank"
        rel="noopener noreferrer"
      >
        {m.header_help()}
      </Button>

      <DownloadButton />
    </HeaderUtilities>
  </CbsHeader>
</div>

<style>
  #khartis-header :global(.bx--header) {
    background-color: var(--cds-ui-background) !important;
    border-color: var(--cds-ui-03) !important;
  }

  #khartis-header :global(.bx--header__menu-trigger > svg) {
    fill: var(--cds-icon-01) !important;
  }

  #khartis-header :global(.bx--header__action:hover) {
    background: var(--cds-background) !important;
  }

  :global(html[theme='g100'])
    #khartis-header
    :global(.header-help-button.bx--btn--tertiary) {
    border-color: var(--cds-border-subtle-01);
    color: var(--cds-text-02);
  }

  :global(html[theme='g100'])
    #khartis-header
    :global(.header-help-button.bx--btn--tertiary:hover) {
    border-color: var(--cds-border-strong-01);
    background-color: var(--cds-hover-ui);
    color: var(--cds-text-01);
  }

  @media (max-width: 1023px) {
    #khartis-header :global(.header-help-button.bx--btn) {
      min-width: 3rem;
      padding-inline: 0.75rem;
      font-size: 0;
    }

    #khartis-header :global(.header-help-button .bx--btn__icon) {
      margin-inline-start: 0;
    }
  }
</style>
