import { beforeEach, describe, expect, it } from 'vitest';
import {
  FormatMode,
  PageModel
} from '$lib/features/commons/constants/ui.constants';
import { persistenceRegistry } from '$lib/features/project-management/core/persistence-registry';
import {
  formatActions,
  getFormatState,
  getLastPageResize
} from './format.store.svelte';

describe('format store page resize', () => {
  beforeEach(() => {
    formatActions.reset();
  });

  it('records the page size a user resize starts from', () => {
    formatActions.setModel(PageModel.A4_LANDSCAPE);
    const before = getLastPageResize()?.id ?? 0;

    formatActions.setModel(PageModel.A3_LANDSCAPE);

    expect(getLastPageResize()).toEqual({
      id: before + 1,
      from: { width: 842, height: 595 },
      to: { width: 1191, height: 842 }
    });
  });

  it('records no resize when a project restores another page size', () => {
    const before = getLastPageResize();

    persistenceRegistry.deserializeAll({
      format: { ...getFormatState(), width: 1191, height: 842 }
    });

    expect(getFormatState().width).toBe(1191);
    expect(getLastPageResize()).toEqual(before);
  });

  it('restores the selected model size when returning to the preset tab', () => {
    formatActions.setModel(PageModel.A4_LANDSCAPE);
    formatActions.setMode(FormatMode.CUSTOM);
    formatActions.setSize(1000, 700);

    formatActions.setMode(FormatMode.PRESET);

    expect(getFormatState()).toMatchObject({
      mode: FormatMode.PRESET,
      model: PageModel.A4_LANDSCAPE,
      width: 842,
      height: 595
    });
  });

  it('restores the margins and map frame a smaller page clamped', () => {
    const margins = { top: 32, right: 32, bottom: 32, left: 32 };
    const mapFrame = { top: 40, right: 140, bottom: 40, left: 140 };
    formatActions.setModel(PageModel.A4_LANDSCAPE);
    formatActions.setMargins(margins);
    formatActions.setMapFrame(mapFrame);

    formatActions.setSize(150, 595);
    expect(getFormatState().margins.left + getFormatState().margins.right).toBe(
      50
    );
    formatActions.setSize(842, 595);

    expect(getFormatState().margins).toEqual(margins);
    expect(getFormatState().mapFrame).toEqual(mapFrame);
  });

  it('keeps an edit made on the smaller page when the page grows back', () => {
    formatActions.setModel(PageModel.A4_LANDSCAPE);
    formatActions.setMargins({ top: 32, right: 32, bottom: 32, left: 32 });
    formatActions.setSize(150, 595);

    formatActions.setMargins({ top: 10, right: 10, bottom: 10, left: 10 });
    formatActions.setSize(842, 595);

    expect(getFormatState().margins).toEqual({
      top: 10,
      right: 10,
      bottom: 10,
      left: 10
    });
  });
});
