<script lang="ts">
  import { globalState } from '$lib/features/commons/store/global.svelte';
  import { projectStore } from '$lib/features/commons/store/project.store.svelte';
  import { clickOutside } from '$lib/features/commons/utils/click-outside';
  import { m } from '$lib/paraglide/messages.js';
  import {
    Button,
    Column,
    Grid,
    Row,
    Select,
    SelectItem,
    SideNav,
    SideNavItems,
    Theme
  } from 'carbon-components-svelte';
  import {
    CopyFile,
    DocumentAdd,
    FolderOpen,
    Launch,
    Save,
    TrashCan
  } from 'carbon-icons-svelte';
  import DeleteConfirmModal from './commons/components/delete-confirm-modal.svelte';
  import DuplicateProjectModal from './commons/components/duplicate-project-modal.svelte';
  import Separator from './commons/components/separator.svelte';
  import { useSideNav } from './side-nav/hooks/use-side-nav.svelte';

  const sideNav = useSideNav();

  function openDuplicateModal() {
    globalState.isDuplicateModalOpen = true;
    sideNav.closeSideNav();
  }

  function closeDuplicateModal() {
    globalState.isDuplicateModalOpen = false;
  }

  function openDeleteModal() {
    globalState.isDeleteModalOpen = true;
    sideNav.closeSideNav();
  }

  function closeDeleteModal() {
    globalState.isDeleteModalOpen = false;
  }
</script>

<div
  id="khartis-side-nav"
  use:clickOutside={{ enabled: globalState.isSideNavOpen }}
  onoutsideclick={sideNav.closeSideNav}
>
  <SideNav class="app-shadow bg-white" bind:isOpen={globalState.isSideNavOpen}>
    <SideNavItems>
      <Grid fullWidth noGutter>
        <Row>
          <Column>
            <h6>{m.sidenav_project()}</h6>
          </Column>
        </Row>

        <Row>
          <Column>
            <Button
              size="small"
              kind="ghost"
              icon={DocumentAdd}
              class="menu-bar-item"
              data-testid="sidenav-new-project"
              on:click={sideNav.handleNewProject}
            >
              {m.sidenav_new_project()}
              <span class="shortcut-icon">⇧⌘N</span>
            </Button>

            <Button
              size="small"
              kind="ghost"
              icon={FolderOpen}
              class="menu-bar-item"
              data-testid="sidenav-open-project"
              on:click={sideNav.handleOpenProject}
            >
              {m.sidenav_open_project()}
              <span class="shortcut-icon">⇧⌘O</span>
            </Button>

            <Button
              size="small"
              kind="ghost"
              icon={Save}
              class="menu-bar-item"
              data-testid="sidenav-save-project"
              disabled={!projectStore.currentProject}
              on:click={sideNav.handleSaveProject}
            >
              {m.sidenav_save_project()}
              <span class="shortcut-icon">⌘S</span>
            </Button>

            <Button
              size="small"
              kind="ghost"
              icon={CopyFile}
              class="menu-bar-item"
              data-testid="sidenav-duplicate-project"
              on:click={openDuplicateModal}
            >
              {m.sidenav_duplicate_project()}
              <span class="shortcut-icon">⇧⌘D</span>
            </Button>

            <Button
              size="small"
              kind="danger-ghost"
              icon={TrashCan}
              class="menu-bar-item"
              data-testid="sidenav-delete-project"
              disabled={!projectStore.currentProject}
              on:click={openDeleteModal}
            >
              {m.sidenav_delete_project()}
              <span class="shortcut-icon">⇧⌘⌫</span>
            </Button>
          </Column>
        </Row>
      </Grid>

      <Separator class="slide-nav-separator" orientation="horizontal" />

      <Grid fullWidth noGutter>
        <Row>
          <Column>
            <h6>{m.sidenav_help()}</h6>
          </Column>
        </Row>

        <Row>
          <Column>
            <Button
              size="small"
              kind="ghost"
              icon={Launch}
              class="menu-bar-item">{m.sidenav_documentation()}</Button
            >
            <Button
              size="small"
              kind="ghost"
              icon={Launch}
              class="menu-bar-item">{m.sidenav_report_bug()}</Button
            >
            <Button
              size="small"
              kind="ghost"
              icon={Launch}
              class="menu-bar-item">{m.sidenav_suggest_feature()}</Button
            >
          </Column>
        </Row>
      </Grid>

      <Separator class="slide-nav-separator" orientation="horizontal" />

      <Grid fullWidth noGutter>
        <Row>
          <Column>
            <h6>{m.sidenav_about()}</h6>
          </Column>
        </Row>

        <Row>
          <Column>
            <Button
              size="small"
              kind="ghost"
              icon={Launch}
              class="menu-bar-item">{m.sidenav_presentation_page()}</Button
            >
            <Button
              size="small"
              kind="ghost"
              icon={Launch}
              class="menu-bar-item">{m.sidenav_github()}</Button
            >
            <Button
              size="small"
              kind="ghost"
              icon={Launch}
              class="menu-bar-item">{m.sidenav_data_privacy()}</Button
            >
            <Button
              size="small"
              kind="ghost"
              icon={Launch}
              class="menu-bar-item">{m.sidenav_khartis_v2()}</Button
            >
          </Column>
        </Row>
      </Grid>

      <Separator class="slide-nav-separator" orientation="horizontal" />
    </SideNavItems>

    <aside>
      <Grid class="menu-bar-item sidenav-bottom-padding" fullWidth noGutter>
        <Row padding>
          <Column>
            <Select
              light
              size="sm"
              selected={sideNav.currentLocale}
              on:change={sideNav.handleLanguageChange}
            >
              <SelectItem value="fr" text={m.sidenav_language_french()} />
              <SelectItem value="en" text={m.sidenav_language_english()} />
            </Select>
          </Column>
        </Row>

        <Row class="mr-5 ml-5 mb-5 flex justify-center">
          <Theme
            render="toggle"
            persist
            toggle={{
              themes: ['white', 'g100'],
              labelA: m.theme_light_mode(),
              labelB: m.theme_dark_mode(),
              hideLabel: true,
              size: 'sm'
            }}
          />
        </Row>
      </Grid>

      <span>{m.sidenav_version()}</span>
      <span>{m.sidenav_copyright({ year: new Date().getFullYear() })}</span>
    </aside>
  </SideNav>
</div>

<DuplicateProjectModal
  bind:open={globalState.isDuplicateModalOpen}
  isLoading={sideNav.isDuplicating}
  onClose={closeDuplicateModal}
  onConfirm={(projectId, newName) =>
    sideNav.handleDuplicateConfirm(projectId, newName, closeDuplicateModal)}
/>

<DeleteConfirmModal
  bind:open={globalState.isDeleteModalOpen}
  projectName={projectStore.projectName}
  onClose={closeDeleteModal}
  onConfirm={() => sideNav.handleDeleteConfirm(closeDeleteModal)}
/>

<style>
  #khartis-side-nav :global(.sidenav-bottom-padding) {
    padding-bottom: var(--cds-spacing-04);
  }

  #khartis-side-nav :global(.menu-bar-item) {
    width: 100%;
  }

  #khartis-side-nav :global(.bx--side-nav__navigation) {
    height: auto !important;
  }

  h6 {
    padding: 0.25rem 0 0.5rem 1rem;
    font-size: 0.8rem;
    color: var(--cds-text-03);
  }

  #khartis-side-nav :global(.slide-nav-separator) {
    margin: var(--cds-spacing-04) 0;
  }

  aside {
    color: var(--cds-text-02);
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    gap: 0.3rem;
    margin-bottom: var(--cds-spacing-03);
    font-size: 0.7rem;
    width: 100%;
  }

  .shortcut-icon {
    font-size: 0.65rem;
    color: var(--cds-text-03);
    margin-left: auto;
  }
</style>
