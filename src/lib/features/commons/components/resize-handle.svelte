<script lang="ts">
  interface Props {
    direction?: 'vertical' | 'horizontal';
    onResize?: (delta: number) => void;
  }

  const { direction = 'vertical', onResize }: Props = $props();

  let isDragging = $state(false);
  let startPos = 0;

  function handlePointerDown(e: PointerEvent) {
    isDragging = true;
    startPos = direction === 'vertical' ? e.clientY : e.clientX;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: PointerEvent) {
    if (!isDragging) return;
    const currentPos = direction === 'vertical' ? e.clientY : e.clientX;
    const delta = currentPos - startPos;
    startPos = currentPos;
    onResize?.(delta);
  }

  function handlePointerUp() {
    isDragging = false;
  }
</script>

<div
  class="resize-handle"
  class:vertical={direction === 'vertical'}
  class:horizontal={direction === 'horizontal'}
  class:dragging={isDragging}
  role="separator"
  aria-orientation={direction}
  onpointerdown={handlePointerDown}
  onpointermove={handlePointerMove}
  onpointerup={handlePointerUp}
  onpointercancel={handlePointerUp}
>
  <div class="handle-indicator"></div>
</div>

<style>
  .resize-handle {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    user-select: none;
    touch-action: none;
  }

  .resize-handle.vertical {
    width: 100%;
    height: 8px;
    cursor: row-resize;
  }

  .resize-handle.horizontal {
    width: 8px;
    height: 100%;
    cursor: col-resize;
  }

  .resize-handle:hover,
  .resize-handle.dragging {
    background: var(--cds-interactive, #0f62fe);
    opacity: 0.3;
  }

  .resize-handle.dragging {
    opacity: 0.5;
  }

  .handle-indicator {
    border-radius: 2px;
    background: var(--cds-border-subtle);
  }

  .vertical .handle-indicator {
    width: 32px;
    height: 3px;
  }

  .horizontal .handle-indicator {
    width: 3px;
    height: 32px;
  }

  .resize-handle:hover .handle-indicator,
  .resize-handle.dragging .handle-indicator {
    background: var(--cds-interactive, #0f62fe);
  }
</style>
