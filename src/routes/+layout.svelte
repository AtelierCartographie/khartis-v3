<script lang="ts">
  import KeyboardShortcuts from '$lib/features/commons/components/keyboard-shortcuts.svelte';
  import { globalState } from '$lib/features/commons/store/global.svelte';
  import { ZoomMode } from '$lib/features/commons/types/global';
  import CreateProject from '$lib/features/create-project/create-project.svelte';
  import Header from '$lib/features/header/header.svelte';
  import MainToolbar from '$lib/features/main-toolbar/main-toolbar.svelte';
  import Sidenav from '$lib/features/side-nav.svelte';
  import StepToolbar from '$lib/features/step-toolbar/step-toolbar.svelte';
  import ZoomToolbar from '$lib/features/zoom-toolbar/zoom-toolbar.svelte';

  import 'carbon-components-svelte/css/all.css';

  import '$lib/features/commons/assets/styles/dimension.css';
  import '$lib/features/commons/assets/styles/flex.css';
  import '$lib/features/commons/assets/styles/global.css';
  import '$lib/features/commons/assets/styles/spacing.css';
  import '$lib/features/commons/assets/styles/theming.css';

  let { children } = $props();

  function handleCloseModal() {
    globalState.isCreateProjectModalOpen = false;
  }

  // Reactive transform style for page zoom
  const pageTransformStyle = $derived(
    globalState.zoom.mode === ZoomMode.Page
      ? `transform: scale(${globalState.zoom.pageZoomLevel / 100}); transform-origin: center center;`
      : ''
  );
</script>

<Header />

<Sidenav />

<KeyboardShortcuts />

<main>
  <article class="main-content">
    <StepToolbar />

    <div class="page-content-wrapper" style={pageTransformStyle}>
      {@render children()}
    </div>

    <ZoomToolbar />

    <div></div>
  </article>

  <CreateProject
    open={globalState.isCreateProjectModalOpen}
    onClose={handleCloseModal}
  />

  <MainToolbar />
</main>

<style>
  main {
    margin-top: var(--cds-header-height);
    position: relative;
    display: flex;
    height: calc(100dvh - var(--cds-header-height));
    overflow: hidden;
    background-color: var(--cds-ui-01);
  }

  .main-content {
    position: relative;
    flex: 1;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--cds-spacing-06);
  }

  .page-content-wrapper {
    flex: 1;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: transform 0.2s ease-in-out;
  }
</style>
