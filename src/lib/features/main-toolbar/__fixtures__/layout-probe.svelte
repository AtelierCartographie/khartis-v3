<script lang="ts">
  import {
    getMainToolbarActualWidthPx,
    getMainToolbarMaxWidthPx
  } from '$lib/features/main-toolbar/main-toolbar.constants';
  import { resolveWorkspaceFitScale } from '$lib/features/commons/utils/workspace-viewport.utils';
  import {
    ToolbarState,
    ToolbarStep
  } from '$lib/features/commons/types/global';

  interface Props {
    windowWidth: number;
    isMobileView: boolean;
    toolbarState: ToolbarState;
    selectedStep: ToolbarStep;
    workspaceWidth: number;
    workspaceHeight: number;
    stepToolbarWidth: number;
    formatWidth: number;
    formatHeight: number;
    onRender?: (snapshot: {
      fitScale: number;
      renderedWidth: number;
      renderedHeight: number;
      centeringOffset: number;
    }) => void;
  }

  let {
    windowWidth,
    isMobileView,
    toolbarState,
    selectedStep,
    workspaceWidth,
    workspaceHeight,
    stepToolbarWidth,
    formatWidth,
    formatHeight,
    onRender
  }: Props = $props();

  const mainToolbarMaxWidth = $derived(
    getMainToolbarMaxWidthPx(windowWidth, isMobileView)
  );
  const mainToolbarActualWidth = $derived(
    getMainToolbarActualWidthPx(
      toolbarState,
      selectedStep,
      windowWidth,
      isMobileView
    )
  );
  const mainToolbarReservedPx = $derived(
    Math.max(0, mainToolbarMaxWidth - mainToolbarActualWidth)
  );
  const fitScale = $derived(
    resolveWorkspaceFitScale({
      viewportWidth: workspaceWidth,
      viewportHeight: workspaceHeight,
      pageWidth: formatWidth,
      pageHeight: formatHeight,
      paddingPx: 30,
      reservedInlineStartPx: isMobileView ? 0 : stepToolbarWidth,
      reservedInlineEndPx: mainToolbarReservedPx,
      maxViewportCoverageRatio: 1
    })
  );
  const renderedWidth = $derived(
    Math.max(1, Math.round(formatWidth * fitScale))
  );
  const renderedHeight = $derived(
    Math.max(1, Math.round(formatHeight * fitScale))
  );
  const centeringOffset = $derived(
    (stepToolbarWidth + mainToolbarActualWidth - mainToolbarMaxWidth) / 2
  );

  $effect(() => {
    onRender?.({
      fitScale,
      renderedWidth,
      renderedHeight,
      centeringOffset
    });
  });
</script>

<div
  data-testid="page"
  data-fit-scale={fitScale}
  data-rendered-width={renderedWidth}
  data-rendered-height={renderedHeight}
  data-centering={centeringOffset}
  style="transform: translate({centeringOffset}px, 0);"
></div>
