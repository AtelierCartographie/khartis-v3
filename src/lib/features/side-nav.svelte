<script lang="ts">
  import { createProjectActions } from '$lib/features/commons/store/create-project.store.svelte';
  import { globalState } from '$lib/features/commons/store/global.svelte';
  import { projectsStore } from '$lib/features/commons/store/projects.store.svelte';
  import { projectStore } from '$lib/features/commons/store/project.store.svelte';
  import { m } from '$lib/paraglide/messages.js';
  import { getLocale, setLocale, type Locale } from '$lib/paraglide/runtime.js';
  import {
    Button,
    Column,
    Grid,
    Modal,
    Row,
    Select,
    SelectItem,
    SideNav,
    SideNavItems,
    Theme
  } from 'carbon-components-svelte';
  import { CopyFile, Launch, Save, TrashCan } from 'carbon-icons-svelte';
  import DuplicateProjectModal from './commons/components/duplicate-project-modal.svelte';
  import Separator from './commons/components/separator.svelte';

  let currentLocale = $state(getLocale());
  let isDuplicateModalOpen = $state(false);
  let isDuplicating = $state(false);
  let isDeleteModalOpen = $state(false);

  function handleNewProject() {
    createProjectActions.selectTab(1);
    globalState.isCreateProjectModalOpen = true;
    globalState.isSideNavOpen = false;
  }

  function handleOpenProject() {
    createProjectActions.selectTab(2);
    globalState.isCreateProjectModalOpen = true;
    globalState.isSideNavOpen = false;
  }

  function handleDuplicateProject() {
    isDuplicateModalOpen = true;
    globalState.isSideNavOpen = false;
  }

  async function handleDuplicateConfirm(projectId: string, newName: string) {
    const project = projectsStore.getProjectById(projectId);

    if (project) {
      isDuplicating = true;
      try {
        const duplicatedProject =
          await projectsStore.duplicateProject(projectId);

        if (duplicatedProject && newName !== duplicatedProject.name) {
          await projectsStore.updateProject(duplicatedProject.id, {
            name: newName
          });
        }

        if (duplicatedProject) {
          await projectsStore.openProject(duplicatedProject.id);
        }
      } finally {
        isDuplicating = false;
        isDuplicateModalOpen = false;
      }
    }
  }

  function handleDeleteProject() {
    isDeleteModalOpen = true;
    globalState.isSideNavOpen = false;
  }

  async function handleSaveProject() {
    if (!projectStore.currentProject) return;
    await projectStore.saveCurrentProject();
    globalState.isSideNavOpen = false;
  }

  async function handleDeleteConfirm() {
    if (projectStore.currentProject) {
      const projectId = projectStore.currentProject.id;
      await projectStore.deleteProject(projectId);
      window.location.reload();
    }
    isDeleteModalOpen = false;
  }

  const handleLanguageChange = (event: Event) => {
    const target = event.target as HTMLSelectElement;
    const newLocale = target.value as Locale;
    setLocale(newLocale);
    currentLocale = newLocale;
  };

  const handleClickOutside = (event: Event) => {
    const target = event.target as HTMLElement;
    const sideNavEl = document.querySelector('.bx--side-nav');

    if (globalState.isSideNavOpen && sideNavEl && !sideNavEl.contains(target)) {
      globalState.isSideNavOpen = false;
    }
  };

  $effect(() => {
    if (globalState.isSideNavOpen) {
      setTimeout(() => {
        document.addEventListener('click', handleClickOutside);
      }, 100);
    } else {
      document.removeEventListener('click', handleClickOutside);
    }

    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  });
</script>

<div id="khartis-side-nav">
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
              class="menu-bar-item"
              data-testid="sidenav-new-project"
              on:click={handleNewProject}
            >
              {m.sidenav_new_project()}
              <span class="shortcut-icon">⇧⌘N</span>
            </Button>

            <Button
              size="small"
              kind="ghost"
              icon={CopyFile}
              class="menu-bar-item"
              data-testid="sidenav-duplicate-project"
              on:click={handleDuplicateProject}
              >{m.sidenav_duplicate_project()}
            </Button>

            <Button
              size="small"
              kind="ghost"
              icon={TrashCan}
              class="menu-bar-item"
              data-testid="sidenav-delete-project"
              disabled={!projectStore.currentProject}
              on:click={handleDeleteProject}
              >{m.sidenav_delete_project()}
            </Button>

            <Button
              size="small"
              kind="ghost"
              icon={Save}
              class="menu-bar-item"
              data-testid="sidenav-save-project"
              disabled={!projectStore.currentProject}
              on:click={handleSaveProject}
            >
              {m.sidenav_save_project()}
              <span class="shortcut-icon">⌘S</span>
            </Button>

            <Button
              size="small"
              kind="ghost"
              class="menu-bar-item"
              data-testid="sidenav-open-project"
              on:click={handleOpenProject}
            >
              {m.sidenav_open_project()}
              <span class="shortcut-icon">⇧⌘O</span>
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
              bind:selected={currentLocale}
              on:change={handleLanguageChange}
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
  bind:open={isDuplicateModalOpen}
  isLoading={isDuplicating}
  onClose={() => (isDuplicateModalOpen = false)}
  onConfirm={handleDuplicateConfirm}
/>

<Modal
  danger
  bind:open={isDeleteModalOpen}
  modalHeading={m.sidenav_delete_confirm_title()}
  primaryButtonText={m.sidenav_delete_confirm_button()}
  secondaryButtonText={m.open_project_cancel()}
  on:click:button--primary={handleDeleteConfirm}
  on:click:button--secondary={() => (isDeleteModalOpen = false)}
  size="sm"
>
  <p>{m.sidenav_delete_confirm_message({ name: projectStore.projectName })}</p>
</Modal>

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
    font-weight: bold;
    font-size: 0.6rem;
    color: var(--cds-text-02);
  }
</style>
