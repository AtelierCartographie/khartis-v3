<script lang="ts">
  import SwitchedContent from '$lib/features/commons/components/switched-content.svelte';
  import ToggleTabs from '$lib/features/commons/components/toggle-tabs.svelte';
  import { AnnotationKind } from '$lib/features/commons/constants/ui.constants';
  import * as m from '$lib/paraglide/messages';
  import { AreaCustom, Image, Pen, TextCreation } from 'carbon-icons-svelte';
  import { onDestroy } from 'svelte';
  import {
    annotationsActions,
    getAnnotationsState
  } from './annotations.store.svelte';
  import DrawingTool from './drawing-tool.svelte';
  import ImageTool from './image-tool.svelte';
  import ShapeTool from './shape-tool.svelte';
  import TextTool from './text-tool.svelte';

  const annotationsState = $derived(getAnnotationsState());

  const TAB_KINDS = [
    AnnotationKind.TEXT,
    AnnotationKind.SHAPE,
    AnnotationKind.DRAWING,
    AnnotationKind.IMAGE
  ] as const;

  const tabItems = $derived([
    { icon: TextCreation, label: m.annotations_text(), iconSize: 16 },
    { icon: AreaCustom, label: m.annotations_shape(), iconSize: 16 },
    { icon: Pen, label: m.annotations_drawing(), iconSize: 16 },
    { icon: Image, label: m.annotations_image(), iconSize: 16 }
  ]);

  // Clearing on close rather than on open keeps the selection made by a
  // click on the map, which opens the tool and selects in the same turn.
  onDestroy(() => {
    if (getAnnotationsState().selectedId) {
      annotationsActions.selectAnnotation(null);
    }
  });

  const activeIndex = $derived(
    Math.max(0, TAB_KINDS.indexOf(annotationsState.activeType))
  );
</script>

<div id="khartis-annotations-tool">
  <ToggleTabs
    size="md"
    activeIndex={activeIndex}
    items={tabItems}
    onchange={(index) => annotationsActions.setActiveType(TAB_KINDS[index])}
  />

  <SwitchedContent value={annotationsState.activeType}>
    {#if annotationsState.activeType === AnnotationKind.TEXT}
      <TextTool />
    {:else if annotationsState.activeType === AnnotationKind.SHAPE}
      <ShapeTool />
    {:else if annotationsState.activeType === AnnotationKind.DRAWING}
      <DrawingTool />
    {:else if annotationsState.activeType === AnnotationKind.IMAGE}
      <ImageTool />
    {/if}
  </SwitchedContent>
</div>

<style>
  #khartis-annotations-tool {
    display: flex;
    flex-direction: column;
    gap: var(--kh-gap-group);
  }

  #khartis-annotations-tool :global(.bx--number input[type='number']) {
    min-width: 0 !important;
  }
</style>
