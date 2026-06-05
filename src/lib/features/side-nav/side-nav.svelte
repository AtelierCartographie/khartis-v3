<script lang="ts">
  import { onMount } from 'svelte';
  import { globalState } from '$lib/features/commons/stores/global.svelte';
  import { projectStore } from '$lib/features/commons/stores/project.store.svelte';
  import {
    detectApplePlatform,
    getSideNavShortcutLabels
  } from '$lib/features/commons/utils/keyboard-shortcuts.utils';
  import { m } from '$lib/paraglide/messages.js';
  import {
    Accordion,
    AccordionItem,
    Button,
    Column,
    ComposedModal,
    Grid,
    InlineNotification,
    ModalBody,
    ModalFooter,
    ModalHeader,
    Row,
    Select,
    SelectItem,
    SideNav,
    SideNavItems,
    Theme
  } from 'carbon-components-svelte';
  import {
    CopyFile,
    Download,
    DocumentAdd,
    FolderOpen,
    Launch,
    Save,
    TrashCan
  } from 'carbon-icons-svelte';
  import DeleteConfirmModal from '../commons/components/delete-confirm-modal.svelte';
  import DuplicateProjectModal from '../commons/components/duplicate-project-modal.svelte';
  import Separator from '../commons/components/separator.svelte';
  import Switch from '../commons/components/switch.svelte';
  import ClearCacheButton from './components/clear-cache-button.svelte';
  import { useSideNav } from './hooks/use-side-nav.svelte';

  const DEFAULT_APP_VERSION = '1.6.0-staging.1';
  const sideNav = useSideNav();
  const appVersion = (
    import.meta.env.VITE_APP_VERSION || DEFAULT_APP_VERSION
  ).replace(/^v/i, '');
  let shortcutLabels = $state(getSideNavShortcutLabels(false));
  let deferredInstallPrompt = $state<BeforeInstallPromptEvent | null>(null);
  let isInstallDialogOpen = $state(false);
  let isInstalledAsApp = $state(false);
  let currentBrowser = $state<BrowserFamily>('other');
  let currentTheme = $state<'white' | 'g10' | 'g80' | 'g90' | 'g100'>('white');

  type BrowserFamily =
    | 'ios'
    | 'chrome'
    | 'safari'
    | 'firefox'
    | 'opera'
    | 'other';

  interface BeforeInstallPromptEvent extends Event {
    readonly platforms?: string[];
    readonly userChoice: Promise<{
      outcome: 'accepted' | 'dismissed';
      platform?: string;
    }>;
    prompt: () => Promise<void>;
  }

  interface NavigatorWithStandalone extends Navigator {
    standalone?: boolean;
  }

  interface InstallInstruction {
    readonly key: BrowserFamily;
    readonly title: string;
    readonly steps: string[];
    readonly note?: string;
    readonly open?: boolean;
  }

  function detectInstalledDisplayMode() {
    if (typeof window === 'undefined') return false;

    const navigatorWithStandalone = window.navigator as NavigatorWithStandalone;

    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      navigatorWithStandalone.standalone === true
    );
  }

  function detectBrowserFamily(userAgent: string): BrowserFamily {
    const normalizedUserAgent = userAgent.toLowerCase();

    if (
      normalizedUserAgent.includes('iphone') ||
      normalizedUserAgent.includes('ipad') ||
      normalizedUserAgent.includes('ipod')
    ) {
      return 'ios';
    }

    if (
      normalizedUserAgent.includes('opr/') ||
      normalizedUserAgent.includes('opera') ||
      normalizedUserAgent.includes('samsungbrowser')
    ) {
      return 'opera';
    }

    if (
      normalizedUserAgent.includes('firefox') ||
      normalizedUserAgent.includes('fxios')
    ) {
      return 'firefox';
    }

    if (
      normalizedUserAgent.includes('chrome') ||
      normalizedUserAgent.includes('crios') ||
      normalizedUserAgent.includes('chromium') ||
      normalizedUserAgent.includes('edg/')
    ) {
      return 'chrome';
    }

    if (
      normalizedUserAgent.includes('safari') ||
      normalizedUserAgent.includes('iphone') ||
      normalizedUserAgent.includes('ipad') ||
      normalizedUserAgent.includes('macintosh')
    ) {
      return 'safari';
    }

    return 'other';
  }

  function getDetectedBrowserLabel() {
    switch (currentBrowser) {
      case 'ios':
        return m.sidenav_install_help_browser_ios();
      case 'chrome':
        return m.sidenav_install_help_browser_chrome();
      case 'safari':
        return m.sidenav_install_help_browser_safari();
      case 'firefox':
        return m.sidenav_install_help_browser_firefox();
      case 'opera':
        return m.sidenav_install_help_browser_opera();
      default:
        return m.sidenav_install_help_browser_other();
    }
  }

  function getInstallButtonStatus() {
    if (isInstalledAsApp) {
      return m.sidenav_install_app_active();
    }
    if (deferredInstallPrompt) {
      return m.sidenav_install_app_ready();
    }
    return m.sidenav_install_app_manual();
  }

  function getInstallButtonAriaLabel() {
    return `${m.sidenav_install_app()}: ${getInstallButtonStatus()}`;
  }

  function getInstallInstructions(): InstallInstruction[] {
    return [
      {
        key: 'ios',
        title: m.sidenav_install_help_ios_title(),
        open: currentBrowser === 'ios',
        steps: [
          m.sidenav_install_help_ios_step_1(),
          m.sidenav_install_help_ios_step_2(),
          m.sidenav_install_help_ios_step_3()
        ]
      },
      {
        key: 'chrome',
        title: m.sidenav_install_help_chromium_title(),
        open: currentBrowser === 'chrome',
        steps: [
          m.sidenav_install_help_chromium_step_1(),
          m.sidenav_install_help_chromium_step_2(),
          m.sidenav_install_help_chromium_step_3()
        ]
      },
      {
        key: 'safari',
        title: m.sidenav_install_help_safari_title(),
        open: currentBrowser === 'safari',
        steps: [
          m.sidenav_install_help_safari_mac_step_1(),
          m.sidenav_install_help_safari_mac_step_2(),
          m.sidenav_install_help_safari_mac_step_3()
        ]
      },
      {
        key: 'firefox',
        title: m.sidenav_install_help_firefox_title(),
        open: currentBrowser === 'firefox',
        steps: [
          m.sidenav_install_help_firefox_step_1(),
          m.sidenav_install_help_firefox_step_2(),
          m.sidenav_install_help_firefox_step_3()
        ]
      },
      {
        key: 'opera',
        title: m.sidenav_install_help_opera_title(),
        open: currentBrowser === 'opera',
        steps: [
          m.sidenav_install_help_opera_step_1(),
          m.sidenav_install_help_opera_step_2(),
          m.sidenav_install_help_opera_step_3()
        ]
      },
      {
        key: 'other',
        title: m.sidenav_install_help_other_title(),
        open: currentBrowser === 'other',
        steps: [
          m.sidenav_install_help_other_step_1(),
          m.sidenav_install_help_other_step_2()
        ],
        note: m.sidenav_install_help_other_note()
      }
    ];
  }

  function closeInstallDialog() {
    isInstallDialogOpen = false;
  }

  const isDarkTheme = $derived(
    currentTheme === 'g80' || currentTheme === 'g90' || currentTheme === 'g100'
  );

  function handleThemeToggle(checked: boolean) {
    currentTheme = checked ? 'g100' : 'white';
  }

  async function handleInstallApp() {
    sideNav.closeSideNav();

    if (isInstalledAsApp) return;

    const installPrompt = deferredInstallPrompt;

    if (!installPrompt) {
      isInstallDialogOpen = true;
      return;
    }

    deferredInstallPrompt = null;

    try {
      await installPrompt.prompt();
      const { outcome } = await installPrompt.userChoice;

      if (outcome === 'accepted') {
        isInstalledAsApp = true;
        closeInstallDialog();
      }
    } catch {
      isInstallDialogOpen = true;
    }
  }

  onMount(() => {
    shortcutLabels = getSideNavShortcutLabels(detectApplePlatform());

    currentBrowser = detectBrowserFamily(window.navigator.userAgent);
    isInstalledAsApp = detectInstalledDisplayMode();

    const displayModeQuery = window.matchMedia('(display-mode: standalone)');

    function handleDisplayModeChange() {
      isInstalledAsApp = detectInstalledDisplayMode();
    }

    function handleBeforeInstallPrompt(event: Event) {
      const installEvent = event as BeforeInstallPromptEvent;
      installEvent.preventDefault();
      deferredInstallPrompt = installEvent;
    }

    function handleAppInstalled() {
      deferredInstallPrompt = null;
      isInstalledAsApp = true;
      closeInstallDialog();
    }

    const removeDisplayModeListener =
      'addEventListener' in displayModeQuery
        ? (() => {
            displayModeQuery.addEventListener(
              'change',
              handleDisplayModeChange
            );
            return () =>
              displayModeQuery.removeEventListener(
                'change',
                handleDisplayModeChange
              );
          })()
        : 'addListener' in displayModeQuery &&
            'removeListener' in displayModeQuery
          ? (() => {
              const legacyDisplayModeQuery =
                displayModeQuery as MediaQueryList & {
                  addListener: (
                    listener: (event: MediaQueryListEvent) => void
                  ) => void;
                  removeListener: (
                    listener: (event: MediaQueryListEvent) => void
                  ) => void;
                };

              legacyDisplayModeQuery.addListener(handleDisplayModeChange);
              return () =>
                legacyDisplayModeQuery.removeListener(handleDisplayModeChange);
            })()
          : () => {};

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener(
        'beforeinstallprompt',
        handleBeforeInstallPrompt
      );
      window.removeEventListener('appinstalled', handleAppInstalled);
      removeDisplayModeListener();
    };
  });

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
              icon={DocumentAdd}
              class="menu-bar-item"
              data-testid="sidenav-new-project"
              on:click={sideNav.handleNewProject}
            >
              {m.sidenav_new_project()}
              <span class="shortcut-icon">{shortcutLabels.newProject}</span>
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
              <span class="shortcut-icon">{shortcutLabels.openProject}</span>
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
              <span class="shortcut-icon">{shortcutLabels.saveProject}</span>
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
              <span class="shortcut-icon"
                >{shortcutLabels.duplicateProject}</span
              >
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
              <span class="shortcut-icon">{shortcutLabels.deleteProject}</span>
            </Button>
          </Column>
        </Row>
      </Grid>

      <Separator class="slide-nav-separator" orientation="horizontal" />

      <Grid fullWidth noGutter>
        <Row>
          <Column>
            <h6>{m.sidenav_app()}</h6>
          </Column>
        </Row>

        <Row>
          <Column>
            <Button
              size="small"
              kind="ghost"
              icon={Download}
              class="menu-bar-item app-action-button"
              data-testid="sidenav-install-app"
              disabled={isInstalledAsApp}
              aria-label={getInstallButtonAriaLabel()}
              on:click={handleInstallApp}
            >
              <span class="app-action-copy">
                <span class="app-action-title">
                  {isInstalledAsApp
                    ? m.sidenav_install_app_installed()
                    : m.sidenav_install_app()}
                </span>
                <span class="app-action-meta">{getInstallButtonStatus()}</span>
              </span>
            </Button>

            <ClearCacheButton />
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
              class="menu-bar-item"
              href="https://www.sciencespo.fr/cartographie/khartis/docs/"
              target="_blank"
              rel="noopener noreferrer">{m.sidenav_documentation()}</Button
            >
            <Button
              size="small"
              kind="ghost"
              icon={Launch}
              class="menu-bar-item"
              href="https://github.com/AtelierCartographie/Khartis/issues/new?template=bug_report.md"
              target="_blank"
              rel="noopener noreferrer">{m.sidenav_report_bug()}</Button
            >
            <Button
              size="small"
              kind="ghost"
              icon={Launch}
              class="menu-bar-item"
              href="https://github.com/AtelierCartographie/Khartis/issues/new?template=feature_request.md"
              target="_blank"
              rel="noopener noreferrer">{m.sidenav_suggest_feature()}</Button
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
              class="menu-bar-item"
              href="https://www.sciencespo.fr/cartographie/khartis/"
              target="_blank"
              rel="noopener noreferrer">{m.sidenav_presentation_page()}</Button
            >
            <Button
              size="small"
              kind="ghost"
              icon={Launch}
              class="menu-bar-item"
              href="https://github.com/AtelierCartographie/Khartis"
              target="_blank"
              rel="noopener noreferrer">{m.sidenav_github()}</Button
            >
            <Button
              size="small"
              kind="ghost"
              icon={Launch}
              class="menu-bar-item"
              href="https://www.sciencespo.fr/cartographie/khartis/docs/FAQ/"
              target="_blank"
              rel="noopener noreferrer">{m.sidenav_data_privacy()}</Button
            >
            <Button
              size="small"
              kind="ghost"
              icon={Launch}
              class="menu-bar-item"
              href="https://www.sciencespo.fr/cartographie/khartis/"
              target="_blank"
              rel="noopener noreferrer">{m.sidenav_khartis_v2()}</Button
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
          <Theme bind:theme={currentTheme} persist>
            <div class="theme-toggle">
              <Switch
                size="sm"
                labelText={m.theme_dark_mode()}
                labelA={m.theme_light_mode()}
                labelB={m.theme_dark_mode()}
                hideLabel
                showStateLabel
                toggled={isDarkTheme}
                onchange={handleThemeToggle}
              />
            </div>
          </Theme>
        </Row>
      </Grid>

      <span>{m.sidenav_version({ version: appVersion })}</span>
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

<div id="khartis-install-dialog">
  <ComposedModal
    open={isInstallDialogOpen}
    size="sm"
    containerClass="install-help-modal"
    on:close={closeInstallDialog}
  >
    <ModalHeader title={m.sidenav_install_help_title()} />

    <ModalBody class="install-help-body">
      <InlineNotification
        kind="info"
        lowContrast
        hideCloseButton
        title={m.sidenav_install_help_intro_title()}
        subtitle={currentBrowser === 'other'
          ? m.sidenav_install_help_intro_generic()
          : m.sidenav_install_help_intro_detected({
              browser: getDetectedBrowserLabel()
            })}
      />

      <Accordion class="install-help-accordion">
        {#each getInstallInstructions() as instruction (instruction.key)}
          <AccordionItem
            title={instruction.title}
            open={instruction.open}
            iconDescription={m.section_toggle()}
          >
            <ol class="install-help-steps">
              {#each instruction.steps as step, i (i)}
                <li>{step}</li>
              {/each}
            </ol>

            {#if instruction.note}
              <p class="install-help-note">{instruction.note}</p>
            {/if}
          </AccordionItem>
        {/each}
      </Accordion>
    </ModalBody>

    <ModalFooter
      secondaryButtonText={m.sidenav_install_help_close()}
      on:click:button--secondary={closeInstallDialog}
    />
  </ComposedModal>
</div>

<style>
  #khartis-side-nav {
    --khartis-side-nav-top: var(--cds-spacing-09, 3rem);
  }

  #khartis-side-nav :global(.sidenav-bottom-padding) {
    padding-bottom: var(--cds-spacing-04);
  }

  #khartis-side-nav :global(.menu-bar-item) {
    width: 100%;
  }

  #khartis-side-nav :global(.app-action-button) {
    min-height: 2.25rem;
    padding-top: var(--cds-spacing-01);
    padding-bottom: var(--cds-spacing-01);
  }

  #khartis-side-nav :global(.app-action-button .bx--btn__icon) {
    flex: 0 0 auto;
  }

  #khartis-side-nav :global(.app-action-copy) {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    min-width: 0;
    line-height: 1.1;
  }

  #khartis-side-nav :global(.app-action-title),
  #khartis-side-nav :global(.app-action-meta) {
    overflow: hidden;
    max-width: 100%;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  #khartis-side-nav :global(.app-action-title) {
    color: currentColor;
    font-size: 0.875rem;
  }

  #khartis-side-nav :global(.app-action-meta) {
    margin-top: 0.0625rem;
    color: var(--cds-text-03);
    font-size: 0.6875rem;
    font-weight: 400;
  }

  #khartis-side-nav :global(.bx--side-nav) {
    top: var(--khartis-side-nav-top);
    height: calc(100dvh - var(--khartis-side-nav-top)) !important;
    padding-left: var(--safe-area-left);
  }

  #khartis-side-nav :global(.bx--side-nav__overlay) {
    top: var(--khartis-side-nav-top);
  }

  #khartis-side-nav :global(.bx--side-nav__overlay-active) {
    height: calc(100dvh - var(--khartis-side-nav-top));
    block-size: calc(100dvh - var(--khartis-side-nav-top));
  }

  #khartis-side-nav :global(.bx--side-nav__navigation) {
    height: calc(100dvh - var(--khartis-side-nav-top)) !important;
  }

  :global(html[theme='g100'] #khartis-side-nav .bx--side-nav) {
    background-color: var(--cds-background);
  }

  :global(html[theme='g100'] #khartis-side-nav .menu-bar-item.bx--btn--ghost) {
    color: var(--cds-text-01) !important;
    background-color: transparent !important;
    border-color: transparent !important;
  }

  :global(
    html[theme='g100'] #khartis-side-nav .menu-bar-item.bx--btn--ghost:hover
  ) {
    color: var(--cds-text-01) !important;
    background-color: var(--khartis-control-surface-background) !important;
  }

  :global(
    html[theme='g100'] #khartis-side-nav .menu-bar-item.bx--btn--ghost:focus
  ) {
    color: var(--cds-text-01) !important;
    border-color: var(--cds-focus) !important;
    box-shadow:
      inset 0 0 0 1px var(--cds-focus),
      inset 0 0 0 2px var(--cds-background) !important;
  }

  :global(
    html[theme='g100'] #khartis-side-nav .menu-bar-item.bx--btn--ghost:active
  ) {
    color: var(--cds-text-01) !important;
    background-color: var(
      --khartis-control-surface-hover-background
    ) !important;
  }

  :global(
    html[theme='g100']
      #khartis-side-nav
      .menu-bar-item.bx--btn--ghost.bx--btn--disabled
  ),
  :global(
    html[theme='g100'] #khartis-side-nav .menu-bar-item.bx--btn--ghost:disabled
  ) {
    color: var(--cds-text-disabled) !important;
  }

  :global(
    html[theme='g100']
      #khartis-side-nav
      .menu-bar-item.bx--btn--ghost
      .bx--btn__icon
  ) {
    fill: currentColor !important;
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

  .theme-toggle {
    display: flex;
    justify-content: center;
    width: 100%;
  }

  #khartis-install-dialog :global(.install-help-modal) {
    width: min(92vw, 28rem);
  }

  #khartis-install-dialog :global(.install-help-body) {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-05);
    max-height: 70vh;
    overflow-y: auto;
    padding-right: var(--cds-spacing-03);
  }

  #khartis-install-dialog :global(.install-help-body .bx--inline-notification) {
    width: 100%;
    max-width: 100%;
    min-width: 0;
  }

  #khartis-install-dialog
    :global(.install-help-body .bx--inline-notification__details),
  #khartis-install-dialog
    :global(.install-help-body .bx--inline-notification__text-wrapper) {
    min-width: 0;
  }

  #khartis-install-dialog
    :global(.install-help-body .bx--inline-notification__title),
  #khartis-install-dialog
    :global(.install-help-body .bx--inline-notification__subtitle) {
    max-width: 100%;
    white-space: normal;
    overflow-wrap: anywhere;
  }

  #khartis-install-dialog :global(.install-help-accordion) {
    margin-top: var(--cds-spacing-03);
  }

  .install-help-steps {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-03);
    margin: 0;
    padding-left: 1.25rem;
  }

  .install-help-note {
    margin-top: var(--cds-spacing-03);
    color: var(--cds-text-02);
    line-height: 1.5;
  }
</style>
