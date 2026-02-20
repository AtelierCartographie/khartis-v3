<script lang="ts">
  import { AnnotationKind } from '$lib/features/commons/constants/ui.constants';
  import Switch from '$lib/features/commons/components/switch.svelte';
  import * as m from '$lib/paraglide/messages';
  import { Button, Column, Grid, Row } from 'carbon-components-svelte';
  import { Crop, Image, Pen, TextCreation } from 'carbon-icons-svelte';
  import {
    annotationsActions,
    getAnnotationsState
  } from './annotations.store.svelte';
  import DrawingTool from './drawing-tool.svelte';
  import ImageTool from './image-tool.svelte';
  import ShapeTool from './shape-tool.svelte';
  import TextTool from './text-tool.svelte';

  const annotationsState = $derived(getAnnotationsState());
  const annotationsVisible = $derived(annotationsState.visible);

  function handleVisibilityChange(visible: boolean): void {
    if (visible !== annotationsState.visible) {
      annotationsActions.setVisibility(visible);
    }
  }
</script>

<div id="khartis-annotations-tool">
  <Grid noGutter fullWidth>
    <Row>
      <Column>
        <div class="switch-row">
          <span class="switch-label">{m.tool_annotations()}</span>
          <Switch
            toggled={annotationsVisible}
            labelText={m.tool_annotations()}
            hideLabel
            labelA={m.layers_hide()}
            labelB={m.layers_show()}
            showStateLabel
            onchange={handleVisibilityChange}
          />
        </div>
      </Column>
    </Row>

    <Row>
      <Column>
        <div class="tool-picker">
          <div
            class:type-btn-active={annotationsState.activeType ===
              AnnotationKind.TEXT}
          >
            <Button
              kind="tertiary"
              size="field"
              icon={TextCreation}
              onclick={() =>
                annotationsActions.setActiveType(AnnotationKind.TEXT)}
            >
              {m.annotations_text()}
            </Button>
          </div>
          <div
            class:type-btn-active={annotationsState.activeType ===
              AnnotationKind.SHAPE}
          >
            <Button
              kind="tertiary"
              size="field"
              icon={Crop}
              onclick={() =>
                annotationsActions.setActiveType(AnnotationKind.SHAPE)}
            >
              {m.annotations_shape()}
            </Button>
          </div>
          <div
            class:type-btn-active={annotationsState.activeType ===
              AnnotationKind.DRAWING}
          >
            <Button
              kind="tertiary"
              size="field"
              icon={Pen}
              onclick={() =>
                annotationsActions.setActiveType(AnnotationKind.DRAWING)}
            >
              {m.annotations_drawing()}
            </Button>
          </div>
          <div
            class:type-btn-active={annotationsState.activeType ===
              AnnotationKind.IMAGE}
          >
            <Button
              kind="tertiary"
              size="field"
              icon={Image}
              onclick={() =>
                annotationsActions.setActiveType(AnnotationKind.IMAGE)}
            >
              {m.annotations_image()}
            </Button>
          </div>
        </div>
      </Column>
    </Row>

    <Row>
      <Column>
        {#if annotationsState.activeType === AnnotationKind.TEXT}
          <TextTool />
        {:else if annotationsState.activeType === AnnotationKind.SHAPE}
          <ShapeTool />
        {:else if annotationsState.activeType === AnnotationKind.DRAWING}
          <DrawingTool />
        {:else if annotationsState.activeType === AnnotationKind.IMAGE}
          <ImageTool />
        {/if}
      </Column>
    </Row>
  </Grid>
</div>

<style lang="scss">
  #khartis-annotations-tool :global(.bx--number input[type='number']) {
    min-width: 0 !important;
  }

  .tool-picker {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--cds-spacing-03);
    margin-bottom: var(--cds-spacing-06);
  }

  .tool-picker > div {
    min-width: 0;
  }

  .tool-picker > div :global(.bx--btn) {
    width: 100%;
    max-width: 100%;
  }

  .type-btn-active :global(.bx--btn--tertiary) {
    background-color: #3c3838;
    color: white;
    border-color: #3c3838;
  }

  .type-btn-active :global(.bx--btn--tertiary:hover) {
    background-color: #2e2c2c;
    border-color: #2e2c2c;
  }

  .switch-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--cds-spacing-04);
    padding: var(--cds-spacing-02) 0 var(--cds-spacing-04) 0;
  }

  .switch-label {
    font-size: 0.875rem;
    color: var(--cds-text-secondary);
    font-weight: 400;
  }
</style>
