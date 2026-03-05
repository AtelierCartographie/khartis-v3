<script lang="ts">
  import { globalState } from '$lib/features/commons/store/global.svelte';
  import { m } from '$lib/paraglide/messages.js';
  import {
    Button,
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
    persistentHamburgerMenu={true}
    bind:isSideNavOpen={globalState.isSideNavOpen}
  >
    <svelte:fragment slot="company">
      <Logo />
    </svelte:fragment>

    <ProjectTitle />

    <HeaderUtilities>
      <Button
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
</style>
