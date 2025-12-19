<script lang="ts">
  import {
    createProjectActions,
    createProjectState
  } from '$lib/features/commons/store/create-project.store.svelte';
  import { projectStore } from '$lib/features/commons/store/project.store.svelte';
  import { m } from '$lib/paraglide/messages';
  import {
    ComposedModal,
    ModalBody,
    ModalHeader
  } from 'carbon-components-svelte';
  import { FileStorage, ShapeExclude, Upload } from 'carbon-icons-svelte';
  import CreateNewProject from './create-new-project.svelte';
  import OpenProject from './open-project.svelte';
  import ProjectName from './project-name.svelte';
  import ProjectTab from './project-tab.svelte';
  import TryWithExample from './try-with-example.svelte';

  interface Props {
    open?: boolean;
    onClose?: () => void;
  }

  const { open = false, onClose }: Props = $props();

  const canDismiss = $derived(!!projectStore.currentProject);

  const TAB_COUNT = 3;
  let tabRefs = $state<HTMLElement[]>([]);

  function handleClose() {
    if (canDismiss) {
      onClose?.();
    }
  }

  function selectTile(index: number) {
    createProjectActions.selectTab(index as 1 | 2 | 3);
  }

  function handleTabKeydown(e: KeyboardEvent, currentTab: number) {
    let newTab = currentTab;

    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      newTab = currentTab === TAB_COUNT ? 1 : currentTab + 1;
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      newTab = currentTab === 1 ? TAB_COUNT : currentTab - 1;
    } else if (e.key === 'Home') {
      e.preventDefault();
      newTab = 1;
    } else if (e.key === 'End') {
      e.preventDefault();
      newTab = TAB_COUNT;
    }

    if (newTab !== currentTab) {
      selectTile(newTab);
      const tabElement = tabRefs[newTab - 1]?.querySelector('[role="tab"]');
      (tabElement as HTMLElement)?.focus();
    }
  }
</script>

<div id="khartis-create-project" data-testid="create-project-modal">
  <ComposedModal preventCloseOnClickOutside open={open} on:close={handleClose}>
    <ModalHeader
      title={m.create_project_welcome()}
      class={canDismiss ? '' : 'no-close-button'}
    >
      <div class="mb-3"></div>
      <span class="text-grey">
        {m.create_project_welcome_description()}
      </span>
    </ModalHeader>

    <ModalBody class="fixed-modal-body">
      <article class="project-selector-wrapper relative">
        <div
          role="tablist"
          class="project-type-selector"
          aria-label={m.create_project_type_selector()}
        >
          <div class="tab-wrapper" bind:this={tabRefs[0]}>
            <ProjectTab
              selected={createProjectState.selectedTab === 1}
              onclick={() => selectTile(1)}
              onkeydown={(e) => handleTabKeydown(e, 1)}
              tabIndex={createProjectState.selectedTab === 1 ? 0 : -1}
              title={m.create_project_new_project()}
              data-testid="tab-create-new"
            >
              {#snippet icon()}
                <Upload size={20} />
              {/snippet}
            </ProjectTab>
          </div>

          <div class="tab-wrapper" bind:this={tabRefs[1]}>
            <ProjectTab
              selected={createProjectState.selectedTab === 2}
              onclick={() => selectTile(2)}
              onkeydown={(e) => handleTabKeydown(e, 2)}
              tabIndex={createProjectState.selectedTab === 2 ? 0 : -1}
              title={m.create_project_open_project()}
              data-testid="tab-open-project"
            >
              {#snippet icon()}
                <FileStorage size={20} />
              {/snippet}
            </ProjectTab>
          </div>

          <div class="tab-wrapper" bind:this={tabRefs[2]}>
            <ProjectTab
              selected={createProjectState.selectedTab === 3}
              onclick={() => selectTile(3)}
              onkeydown={(e) => handleTabKeydown(e, 3)}
              tabIndex={createProjectState.selectedTab === 3 ? 0 : -1}
              title={m.create_project_try_example()}
              data-testid="tab-try-example"
            >
              {#snippet icon()}
                <ShapeExclude size={20} />
              {/snippet}
            </ProjectTab>
          </div>
        </div>

        <div class="tab-content" data-testid="tab-content">
          {#if createProjectState.selectedTab === 1}
            <CreateNewProject onClose={handleClose} isModal />
          {:else if createProjectState.selectedTab === 2}
            <OpenProject onClose={handleClose} />
          {:else if createProjectState.selectedTab === 3}
            <TryWithExample onClose={handleClose} />
          {/if}
        </div>

        {#if createProjectState.selectedTab === 1}
          <ProjectName onClose={handleClose} />
        {/if}
      </article>
    </ModalBody>
  </ComposedModal>
</div>

<style lang="scss">
  #khartis-create-project :global(.bx--modal-container) {
    width: 90vw;
    max-width: 700px;
    height: 85vh;
    background: var(--cds-background);
  }

  #khartis-create-project :global(.fixed-modal-body) {
    height: calc(85vh - 120px);
    overflow: hidden;
    padding: var(--cds-spacing-05);
  }

  #khartis-create-project :global(.no-close-button .bx--modal-close) {
    display: none;
  }

  .project-selector-wrapper {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-07);
    height: 100%;
  }

  .project-type-selector {
    margin-top: var(--cds-spacing-02);
    display: flex;
    flex-direction: row;
    gap: var(--cds-spacing-05);
    width: 100%;
    flex-shrink: 0;
  }

  .tab-wrapper {
    flex: 1;
  }

  .tab-content {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    padding-right: var(--cds-spacing-03);
    scrollbar-width: thin;
    scrollbar-color: var(--cds-border-subtle) transparent;

    &::-webkit-scrollbar {
      width: 6px;
    }

    &::-webkit-scrollbar-track {
      background: transparent;
    }

    &::-webkit-scrollbar-thumb {
      background-color: var(--cds-border-subtle);
      border-radius: 3px;

      &:hover {
        background-color: var(--cds-border-strong);
      }
    }
  }

  #khartis-create-project :global(.bx--tile) {
    flex: 1;
  }

  @media (max-width: 1024px) {
    #khartis-create-project :global(.bx--modal-container) {
      width: 95vw;
      height: 90vh;
    }

    #khartis-create-project :global(.fixed-modal-body) {
      height: calc(90vh - 120px);
    }
  }

  @media (max-width: 768px) {
    #khartis-create-project :global(.bx--modal-container) {
      width: 98vw;
      height: 95vh;
    }

    #khartis-create-project :global(.fixed-modal-body) {
      height: calc(95vh - 120px);
      padding: var(--cds-spacing-04);
    }

    .project-type-selector {
      flex-direction: column;
      gap: var(--cds-spacing-03);
    }
  }
</style>
