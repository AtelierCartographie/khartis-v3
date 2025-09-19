<script lang="ts">
  import { createProjectActions } from '$lib/features/commons/store/create-project.store.svelte';
  import { globalState } from '$lib/features/commons/store/global.svelte';
  import { m } from '$lib/paraglide/messages.js';
  import {
    Button,
    Header as CbsHeader,
    HeaderUtilities
  } from 'carbon-components-svelte';
  import { Add, FolderOpen, Help } from 'carbon-icons-svelte';
  import DownloadButton from './download-button.svelte';
  import Logo from './logo.svelte';
  import ProjectTitle from './project-title.svelte';

  function handleNewProject() {
    createProjectActions.selectTab(1);
    globalState.isCreateProjectModalOpen = true;
  }

  function handleOpenProject() {
    createProjectActions.selectTab(2);
    globalState.isCreateProjectModalOpen = true;
  }
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
        kind="ghost"
        icon={Help}
      >
        {m.header_help()}
      </Button>

      <Button
        tooltipPosition="bottom"
        tooltipAlignment="end"
        iconDescription="New Project"
        kind="ghost"
        icon={Add}
        on:click={handleNewProject}
      />

      <Button
        tooltipPosition="bottom"
        tooltipAlignment="end"
        iconDescription="Open Project"
        kind="ghost"
        icon={FolderOpen}
        on:click={handleOpenProject}
      />

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
