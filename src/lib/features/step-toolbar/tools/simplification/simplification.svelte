<script lang="ts">
  import ToggleTabs from '$lib/features/commons/components/toggle-tabs.svelte';
  import { LogCategory, logger } from '$lib/features/commons/utils/logger';
  import {
    SimplificationLevel,
    SimplificationSource
  } from '$lib/features/commons/types/enums';
  import { m } from '$lib/paraglide/messages';
  import {
    Column,
    Grid,
    InlineNotification,
    RadioButton,
    RadioButtonGroup,
    Row,
    Slider
  } from 'carbon-components-svelte';
  import { DocumentAdd, Earth } from 'carbon-icons-svelte';
  import { osmBasemapStore } from '$lib/features/map/stores/osm-basemap.store.svelte';
  import {
    simplificationActions,
    getSimplificationState
  } from '../simplification/simplification.store.svelte';
  import { onDestroy } from 'svelte';

  const store = simplificationActions;
  const state = $derived(getSimplificationState());
  const isOsmBasemapActive = $derived(osmBasemapStore.isActive);
  const isBasemapSourceBlocked = $derived(
    state.source === SimplificationSource.Basemap && isOsmBasemapActive
  );
  let applyTimeoutId: ReturnType<typeof setTimeout> | null = null;

  const sourceIndex = $derived(
    state.source === SimplificationSource.Basemap ? 0 : 1
  );

  const sources = [
    { icon: Earth, label: m.simplification_source_basemap(), iconSize: 20 },
    {
      icon: DocumentAdd,
      label: m.simplification_source_geodata(),
      iconSize: 20
    }
  ];

  function onSourceChange(index: number) {
    const newSource =
      index === 0 ? SimplificationSource.Basemap : SimplificationSource.Geo;
    store.setSource(newSource);

    if (newSource === SimplificationSource.Basemap && isOsmBasemapActive) {
      return;
    }

    scheduleSimplificationApply('source-change');
  }

  function clearApplyTimeout(): void {
    if (!applyTimeoutId) return;
    clearTimeout(applyTimeoutId);
    applyTimeoutId = null;
  }

  async function applySimplificationNow(trigger: string): Promise<void> {
    if (isBasemapSourceBlocked) {
      logger.info(
        'Simplification skipped: OSM basemap is active',
        LogCategory.UI,
        {
          trigger
        }
      );
      return;
    }

    if (state.isProcessing) {
      return;
    }

    try {
      await store.applySimplification();
    } catch (error) {
      logger.error(
        'Failed to apply simplification from step-toolbar',
        LogCategory.UI,
        { trigger, error }
      );
    }
  }

  function scheduleSimplificationApply(trigger: string, delay = 0): void {
    if (isBasemapSourceBlocked) {
      return;
    }

    clearApplyTimeout();

    if (delay > 0) {
      applyTimeoutId = setTimeout(() => {
        applyTimeoutId = null;
        void applySimplificationNow(trigger);
      }, delay);
      return;
    }

    void applySimplificationNow(trigger);
  }

  onDestroy(() => {
    clearApplyTimeout();
  });
</script>

<div id="khartis-simplification-tool">
  <Grid noGutter fullWidth class="simplification-grid">
    <Row>
      <Column>
        <p class="description">{m.simplification_description()}</p>
      </Column>
    </Row>

    <Row>
      <Column>
        <ToggleTabs
          items={sources}
          activeIndex={sourceIndex}
          onChange={onSourceChange}
          className="source-tabs"
          activeClass="active"
          fullWidthClass="full-width"
          hideInactiveLabel
        />
      </Column>
    </Row>

    {#if state.source === SimplificationSource.Basemap}
      {#if isOsmBasemapActive}
        <Row>
          <Column>
            <InlineNotification
              kind="warning"
              lowContrast
              title={m.simplification_osm_not_available()}
              subtitle={m.simplification_osm_explanation()}
            />
          </Column>
        </Row>
      {/if}

      <Row>
        <Column>
          <div class="form-label">{m.simplification_level_label()}</div>
          <RadioButtonGroup
            orientation="horizontal"
            selected={state.level}
            on:change={(e) => {
              if (isOsmBasemapActive) return;
              store.setLevel((e as CustomEvent).detail as SimplificationLevel);
              scheduleSimplificationApply('level-change');
            }}
          >
            <RadioButton
              value={SimplificationLevel.Low}
              labelText={m.simplification_level_low()}
              disabled={isOsmBasemapActive}
            />
            <RadioButton
              value={SimplificationLevel.Medium}
              labelText={m.simplification_level_medium()}
              disabled={isOsmBasemapActive}
            />
            <RadioButton
              value={SimplificationLevel.High}
              labelText={m.simplification_level_high()}
              disabled={isOsmBasemapActive}
            />
          </RadioButtonGroup>
        </Column>
      </Row>
    {/if}

    {#if state.source === SimplificationSource.Geo}
      <Row>
        <Column>
          <InlineNotification
            kind="warning"
            lowContrast
            title={m.simplification_warning_title()}
            subtitle={m.simplification_warning_subtitle()}
          />
        </Column>
      </Row>

      <Row>
        <Column>
          <div class="form-label">{m.simplification_rate_label()}</div>
          <div class="slider-row">
            <Slider
              min={0}
              max={100}
              step={1}
              value={state.rate}
              on:change={(e) => {
                store.setRate((e as CustomEvent).detail || 50);
                scheduleSimplificationApply('rate-change', 250);
              }}
              labelText=""
              minLabel="0"
              maxLabel="100"
              fullWidth
            />
          </div>
        </Column>
      </Row>
    {/if}
  </Grid>
</div>

<style>
  .description {
    color: var(--cds-text-secondary);
    font-size: 1rem;
    margin-bottom: 1.5rem;
  }
  #khartis-simplification-tool :global(.source-tabs) {
    width: 100%;
    margin-bottom: 1.5rem;
  }

  .slider-row {
    display: flex;
    align-items: center;
    gap: 1rem;
  }
  #khartis-simplification-tool :global(.bx--number) {
    width: 96px;
  }
  .form-label {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--cds-text-01);
    margin-bottom: var(--cds-spacing-03);
    display: block;
  }
  #khartis-simplification-tool :global(.bx--radio-button-group--horizontal) {
    gap: 2rem;
  }
</style>
