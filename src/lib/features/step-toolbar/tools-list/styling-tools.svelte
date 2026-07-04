<script lang="ts">
  import IconButton from '$lib/features/commons/components/carbon/icon-button.svelte';
  import { globalState } from '$lib/features/commons/stores/global.svelte';
  import { StylingTools } from '$lib/features/commons/types/global';
  import { m } from '$lib/paraglide/messages';
  import { Column, Grid, Row } from 'carbon-components-svelte';
  import {
    Compass,
    Crop,
    Legend,
    SettingsView,
    WatsonHealthTextAnnotationToggle
  } from 'carbon-icons-svelte';
  import {
    getLegendState,
    legendActions
  } from '$lib/features/step-toolbar/tools/legend/legend.store.svelte';
  import { annotationsActions } from '$lib/features/step-toolbar/tools/annotations/annotations.store.svelte';
  import {
    getColorBlindnessState,
    isColorBlindnessActive
  } from '$lib/features/step-toolbar/tools/color-blindness/color-blindness.store.svelte';
  import { selectTool } from './tool-list.utils.svelte';
  import ToolsListContainer from './tools-list-container.svelte';
  import { CSS_CLASSES } from '../step-toolbar.constants';

  const colorBlindnessState = $derived(getColorBlindnessState());
  const showColorBlindnessBadge = $derived(
    isColorBlindnessActive(colorBlindnessState)
  );

  const legendState = $derived(getLegendState());
  const showLegendBadge = $derived(!legendState.hasBeenOpened);

  function handleLegendClick() {
    legendActions.markAsOpened();
    selectTool(StylingTools.Legend);
  }

  function handleAnnotationsClick() {
    if (globalState.selectedTool === StylingTools.Annotations) {
      selectTool(StylingTools.Annotations);
      return;
    }

    annotationsActions.initPageElements({
      withPlaceholders: true,
      visible: true
    });
    selectTool(StylingTools.Annotations);
  }
</script>

<ToolsListContainer>
  <Grid noGutter padding={false} class={CSS_CLASSES.TOOLS_GRID}>
    <Row>
      <Column>
        <IconButton
          tooltipPosition="right"
          kind="ghost"
          iconDescription={m.tool_format()}
          icon={Crop}
          size="small"
          isSelected={globalState.selectedTool === StylingTools.Format}
          onclick={() => selectTool(StylingTools.Format)}
        />
      </Column>
    </Row>

    <Row>
      <Column>
        <div class={CSS_CLASSES.TOOL_BUTTON_WRAPPER}>
          <IconButton
            tooltipPosition="right"
            kind="ghost"
            iconDescription={m.tool_legend()}
            icon={Legend}
            size="small"
            isSelected={globalState.selectedTool === StylingTools.Legend}
            onclick={handleLegendClick}
          />
          {#if showLegendBadge}
            <span class={CSS_CLASSES.NOTIFICATION_BADGE}></span>
          {/if}
        </div>
      </Column>
    </Row>

    <Row>
      <Column>
        <IconButton
          tooltipPosition="right"
          kind="ghost"
          iconDescription={m.tool_geo_indications()}
          icon={Compass}
          size="small"
          isSelected={globalState.selectedTool === StylingTools.GeoIndications}
          onclick={() => selectTool(StylingTools.GeoIndications)}
        />
      </Column>
    </Row>

    <Row>
      <Column>
        <IconButton
          tooltipPosition="right"
          kind="ghost"
          iconDescription={m.tool_annotations()}
          icon={WatsonHealthTextAnnotationToggle}
          size="small"
          isSelected={globalState.selectedTool === StylingTools.Annotations}
          onclick={handleAnnotationsClick}
        />
      </Column>
    </Row>

    <Row>
      <Column>
        <div class={CSS_CLASSES.TOOL_BUTTON_WRAPPER}>
          <IconButton
            tooltipPosition="right"
            kind="ghost"
            iconDescription={m.tool_color_blindness()}
            icon={SettingsView}
            size="small"
            isSelected={globalState.selectedTool ===
              StylingTools.ColorBlindness}
            onclick={() => selectTool(StylingTools.ColorBlindness)}
          />
          {#if showColorBlindnessBadge}
            <span class={CSS_CLASSES.NOTIFICATION_BADGE}></span>
          {/if}
        </div>
      </Column>
    </Row>
  </Grid>
</ToolsListContainer>
