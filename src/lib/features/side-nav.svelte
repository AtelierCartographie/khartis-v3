<script lang="ts">
  import { globalState } from '$lib/features/commons/store/global.svelte';
  import { m } from '$lib/paraglide/messages.js';
  import { getLocale, setLocale, type Locale } from '$lib/paraglide/runtime.js';
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
  import { CopyFile, Launch } from 'carbon-icons-svelte';
  import Separator from './commons/components/separator.svelte';

  let currentLocale = $state(getLocale());

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
            <Button size="small" kind="ghost" class="menu-bar-item">
              {m.sidenav_new_project()}
              <span class="shortcut-icon">⇧⌘N</span>
            </Button>

            <Button
              size="small"
              kind="ghost"
              icon={CopyFile}
              class="menu-bar-item"
              >{m.sidenav_duplicate_project()}
            </Button>

            <Button size="small" kind="ghost" class="menu-bar-item">
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
