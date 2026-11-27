<script lang="ts">
  import { resolve } from '$app/paths';
  import Button from '$lib/features/commons/components/carbon/button.svelte';
  import { globalState } from '$lib/features/commons/stores/global.svelte';
  import { createProjectActions } from '$lib/features/commons/stores/create-project.store.svelte';
  import { m } from '$lib/paraglide/messages';
  import { DOC_LINK } from '$lib/features/commons/constants/doc-links.constants';
  import {
    Header as CbsHeader,
    HeaderUtilities
  } from 'carbon-components-svelte';
  import { Help } from 'carbon-icons-svelte';
  import { onMount } from 'svelte';
  import TooltipBubble from '$lib/features/commons/components/carbon/tooltip-bubble.svelte';
  import { getShortcut } from '$lib/features/commons/utils/keyboard-shortcuts.utils';
  import DownloadButton from './components/download-button.svelte';
  import Logo from '$lib/features/commons/components/logo.svelte';
  import ProjectTitle from './components/project-title.svelte';

  // Carbon forwards unknown props to the logo link but does not type them.
  const logoLinkAttributes: Record<string, string> = $derived({
    'aria-label': m.header_logo_open_home()
  });

  const MENU_TOGGLE_SELECTOR = '#khartis-header .bx--header__menu-toggle';

  let menuToggle = $state<HTMLElement | null>(null);
  let isMenuToggleHovered = $state(false);

  const menuTooltip = $derived(
    globalState.isSideNavOpen ? m.a11y_close_menu() : m.a11y_open_menu()
  );

  // Carbon renders the hamburger button itself and offers no tooltip for it.
  onMount(() => {
    const toggle = document.querySelector<HTMLElement>(MENU_TOGGLE_SELECTOR);
    if (!toggle) return;

    // Carbon flips isSideNavOpen in its own click handler, which runs first.
    const handleToggleClick = () => {
      if (!globalState.isSideNavOpen) createProjectActions.dismissSideNav();
    };
    const show = () => (isMenuToggleHovered = true);
    const hide = () => (isMenuToggleHovered = false);
    menuToggle = toggle;
    toggle.addEventListener('click', handleToggleClick);
    toggle.addEventListener('pointerenter', show);
    toggle.addEventListener('pointerleave', hide);
    toggle.addEventListener('focus', show);
    toggle.addEventListener('blur', hide);

    return () => {
      toggle.removeEventListener('click', handleToggleClick);
      toggle.removeEventListener('pointerenter', show);
      toggle.removeEventListener('pointerleave', hide);
      toggle.removeEventListener('focus', show);
      toggle.removeEventListener('blur', hide);
    };
  });

  function openHome(event: MouseEvent): void {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0)
      return;
    event.preventDefault();
    globalState.isSideNavOpen = false;
    if (globalState.isCreateProjectModalOpen) return;
    createProjectActions.resetAllTabs();
    globalState.isCreateProjectModalOpen = true;
  }
</script>

<div id="khartis-header">
  <CbsHeader
    href={resolve('/')}
    uiShellAriaLabel={m.app_name()}
    {...logoLinkAttributes}
    on:click={openHome}
    persistentHamburgerMenu={true}
    ariaLabelMenu={globalState.isSideNavOpen
      ? m.a11y_close_menu()
      : m.a11y_open_menu()}
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
        href={DOC_LINK.HELP_AND_RESOURCES}
        target="_blank"
        rel="noopener noreferrer"
      >
        {m.header_help()}
      </Button>

      <DownloadButton />
    </HeaderUtilities>
  </CbsHeader>

  {#if isMenuToggleHovered && menuToggle}
    <TooltipBubble
      text={menuTooltip}
      shortcut={getShortcut('mainMenu')}
      trigger={menuToggle}
      direction="bottom"
      align="start"
    />
  {/if}
</div>

<style>
  #khartis-header :global(.bx--header) {
    background-color: var(--cds-background) !important;
    border-color: var(--cds-border-subtle-00) !important;
    height: var(--cds-header-height);
    padding-top: var(--safe-area-top);
  }

  /* The logo block ends at the beta tag, so that the project title can
     keep equal space on both sides. */
  #khartis-header :global(.bx--header__name) {
    padding: 0;
  }

  #khartis-header :global(#khartis-logo) {
    padding-inline: var(--cds-spacing-05) 0;
  }

  /* The two actions sit inside the bar, apart from each other, rather than
     running its full height edge to edge. */
  #khartis-header :global(.bx--header__global) {
    flex: 0 0 auto;
    align-items: center;
    gap: var(--cds-spacing-03);
    padding-inline-end: var(--cds-spacing-03);
  }

  /* Only the two bar buttons: the download dialog renders inside this
     element too. */
  #khartis-header :global(.bx--header__global > .header-help-button),
  #khartis-header :global(#khartis-download-button > .bx--btn) {
    height: var(--kh-size-md);
    min-height: var(--kh-size-md);
  }

  #khartis-header :global(.bx--header__menu-trigger) {
    min-width: var(--kh-size-header);
    min-height: var(--kh-size-header);
  }

  #khartis-header :global(.bx--header__menu-trigger > svg) {
    fill: var(--cds-icon-primary) !important;
  }

  #khartis-header :global(.bx--header__action:hover) {
    background: var(--cds-background) !important;
  }

  :global(html[theme='g100'])
    #khartis-header
    :global(.header-help-button.bx--btn--tertiary) {
    border-color: var(--cds-border-subtle-01);
    color: var(--cds-text-secondary);
  }

  :global(html[theme='g100'])
    #khartis-header
    :global(.header-help-button.bx--btn--tertiary:hover) {
    border-color: var(--cds-border-strong-01);
    background-color: var(--cds-layer-hover-01);
    color: var(--cds-text-primary);
  }

  @media (max-width: 1023px) {
    #khartis-header :global(.header-help-button.bx--btn) {
      min-width: 3rem;
      min-height: 3rem;
      padding-inline: 0.75rem;
      font-size: 0;
    }

    #khartis-header :global(.header-help-button .bx--btn__icon) {
      margin-inline-start: 0;
    }
  }
</style>
