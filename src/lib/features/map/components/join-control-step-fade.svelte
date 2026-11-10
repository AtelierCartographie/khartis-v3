<script lang="ts">
  import { untrack } from 'svelte';
  import { globalState } from '$lib/features/commons/stores/global.svelte';
  import { mapInstanceStore } from '$lib/features/commons/stores/map-instance.store.svelte';
  import { ToolbarStep } from '$lib/features/commons/types/global';
  import { motionDuration } from '$lib/features/commons/utils/step-transition.svelte';

  // Entering or leaving the Data step swaps the join control for the
  // visualizations: the last frame fades out over the new one.
  const FADE_MS = 600;

  let wasDataStep = untrack(
    () => globalState.selectedStep === ToolbarStep.Data
  );

  function fadeOutLastFrame(): void {
    const duration = motionDuration(FADE_MS);
    if (duration === 0 || globalState.isMapExporting) return;

    const canvas =
      mapInstanceStore.deckInstance?.getCanvas() ??
      mapInstanceStore.getMapCanvas();
    const container = canvas?.parentElement;
    if (!canvas || !container || canvas.width === 0 || canvas.height === 0) {
      return;
    }

    const frame = document.createElement('canvas');
    frame.width = canvas.width;
    frame.height = canvas.height;
    const context = frame.getContext('2d');
    if (!context) return;
    // Read before the next frame is drawn, while the canvas still shows the
    // previous step.
    context.drawImage(canvas, 0, 0);

    // The canvas fills its container, which keeps the page's proportions as
    // the panel resizes it: the frame stretches with it.
    Object.assign(frame.style, {
      position: 'absolute',
      inset: '0',
      width: '100%',
      height: '100%',
      pointerEvents: 'none'
    });
    frame.setAttribute('aria-hidden', 'true');
    container.appendChild(frame);

    frame
      .animate([{ opacity: 1 }, { opacity: 0 }], {
        duration,
        easing: 'ease-in-out',
        fill: 'forwards'
      })
      .finished.catch(() => undefined)
      .finally(() => frame.remove());
  }

  $effect.pre(() => {
    const isDataStep = globalState.selectedStep === ToolbarStep.Data;
    if (isDataStep === wasDataStep) return;
    wasDataStep = isDataStep;
    untrack(fadeOutLastFrame);
  });
</script>
