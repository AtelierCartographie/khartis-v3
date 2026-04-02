<script lang="ts">
  import { AnnotationKind } from '$lib/features/commons/constants/ui.constants';
  import * as m from '$lib/paraglide/messages';
  import { Button, Column, Grid, Row } from 'carbon-components-svelte';
  import { AreaCustom, Image, Pen, TextCreation } from 'carbon-icons-svelte';
  import {
    annotationsActions,
    getAnnotationsState
  } from './annotations.store.svelte';
  import DrawingTool from './drawing-tool.svelte';
  import ImageTool from './image-tool.svelte';
  import ShapeTool from './shape-tool.svelte';
  import TextTool from './text-tool.svelte';

  const annotationsState = $derived(getAnnotationsState());
</script>

<div id="khartis-annotations-tool">
  <Grid noGutter fullWidth>
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
              icon={AreaCustom}
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
    background-color: var(--cds-background-inverse, #393939);
    color: var(--cds-text-inverse, #ffffff);
    border-color: var(--cds-background-inverse, #393939);
  }

  .type-btn-active :global(.bx--btn--tertiary:hover) {
    background-color: var(--cds-background-inverse-hover, #353535);
    border-color: var(--cds-background-inverse-hover, #353535);
  }
</style>
