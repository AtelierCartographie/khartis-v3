import type { LegendTitleAlign } from '$lib/features/step-toolbar/types/legend.types';

interface SideTitleAlignParams {
  align: LegendTitleAlign;
  /** Changes whenever the drawn legend does, so the alignment is measured again. */
  key: string;
}

let measureContext: CanvasRenderingContext2D | null = null;

// An SVG text box spans the font's ascent and descent: the baseline sits at
// the ascent's share of its height.
function getBaseline(text: SVGTextElement, originTop: number): number | null {
  const rect = text.getBoundingClientRect();
  if (rect.height <= 0) return null;

  measureContext ??= document.createElement('canvas').getContext('2d');
  const style = getComputedStyle(text);
  let ascentShare = 0.8;
  if (measureContext) {
    measureContext.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    const metrics = measureContext.measureText('Hg');
    const total =
      metrics.fontBoundingBoxAscent + metrics.fontBoundingBoxDescent;
    if (total > 0) ascentShare = metrics.fontBoundingBoxAscent / total;
  }
  return rect.top - originTop + rect.height * ascentShare;
}

function getBaselines(root: Element, originTop: number): number[] {
  return Array.from(root.querySelectorAll<SVGTextElement>('text'))
    .filter((text) => text.textContent?.trim())
    .map((text) => getBaseline(text, originTop))
    .filter((baseline): baseline is number => baseline !== null);
}

/**
 * Sets a side title against the entries of its legend. At the top, the first
 * title line shares the baseline of the highest entry text; at the bottom, the
 * last title line shares the baseline of the lowest one.
 */
export function alignSideTitle(
  node: HTMLElement,
  params: SideTitleAlignParams
): { update: (next: SideTitleAlignParams) => void; destroy: () => void } {
  let current = params;
  let frame = 0;
  let destroyed = false;

  function apply(): void {
    const head = node.querySelector<HTMLElement>('.legend-side-head');
    const entries = node.querySelector<HTMLElement>('.legend-entries');
    if (!head || !entries) return;

    head.style.marginTop = '';
    entries.style.marginTop = '';
    head.style.alignSelf = current.align === 'center' ? 'center' : 'start';
    if (current.align === 'center') return;

    const originTop = node.getBoundingClientRect().top;
    const titleBaselines = getBaselines(head, originTop);
    const entryBaselines = getBaselines(entries, originTop);
    if (titleBaselines.length === 0 || entryBaselines.length === 0) return;

    const delta =
      current.align === 'end'
        ? Math.max(...entryBaselines) - Math.max(...titleBaselines)
        : Math.min(...entryBaselines) - Math.min(...titleBaselines);
    // Screen pixels back to the frame's own units, which a page zoom scales.
    const scale = node.getBoundingClientRect().width / (node.offsetWidth || 1);
    const offset = delta / (scale || 1);
    if (Math.abs(offset) < 0.25) return;

    if (offset > 0) {
      head.style.marginTop = `${offset}px`;
    } else {
      entries.style.marginTop = `${-offset}px`;
    }
  }

  function schedule(): void {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      if (!destroyed) apply();
    });
  }

  schedule();
  void document.fonts?.ready.then(() => {
    if (!destroyed) schedule();
  });

  return {
    update(next) {
      current = next;
      schedule();
    },
    destroy() {
      destroyed = true;
      cancelAnimationFrame(frame);
    }
  };
}
