import { describe, expect, it } from 'vitest';
import {
  StylingTools,
  VisualizationTools
} from '$lib/features/commons/types/global';
import { shouldBlockToolClose } from './tool-close-guard';

describe('shouldBlockToolClose', () => {
  it('blocks closing annotations while drawing mode is active', () => {
    expect(shouldBlockToolClose(StylingTools.Annotations, true)).toBeTruthy();
  });

  it('does not block closing annotations outside drawing mode', () => {
    expect(shouldBlockToolClose(StylingTools.Annotations, false)).toBeFalsy();
  });

  it('does not block other tools even if drawing mode is active', () => {
    expect(shouldBlockToolClose(StylingTools.Legend, true)).toBeFalsy();
    expect(shouldBlockToolClose(VisualizationTools.Search, true)).toBeFalsy();
    expect(shouldBlockToolClose(undefined, true)).toBeFalsy();
  });
});
