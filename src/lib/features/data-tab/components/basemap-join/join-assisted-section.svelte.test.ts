import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
} from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as m from '$lib/paraglide/messages';
import JoinAssistedSection from './join-assisted-section.svelte';

let requestAnimationFrameMock: ReturnType<typeof vi.fn>;

function createIntersectionEntry(element: Element): IntersectionObserverEntry {
  const rect = element.getBoundingClientRect();
  return {
    boundingClientRect: rect,
    intersectionRatio: 1,
    intersectionRect: rect,
    isIntersecting: true,
    rootBounds: null,
    target: element,
    time: 0
  } as IntersectionObserverEntry;
}

class ImmediateIntersectionObserver implements IntersectionObserver {
  readonly root = null;

  readonly rootMargin = '';

  readonly scrollMargin = '';

  readonly thresholds = [0];

  constructor(private readonly callback: IntersectionObserverCallback) {}

  observe(element: Element): void {
    this.callback([createIntersectionEntry(element)], this);
  }

  unobserve(): void {}

  disconnect(): void {}

  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

describe('JoinAssistedSection', () => {
  beforeEach(() => {
    requestAnimationFrameMock = vi.fn(() => 1);
    vi.stubGlobal('IntersectionObserver', ImmediateIntersectionObserver);
    vi.stubGlobal('requestAnimationFrame', requestAnimationFrameMock);
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('controls to-verify combo boxes without DOM synchronization frames', async () => {
    const onMappingChange = vi.fn();

    render(JoinAssistedSection, {
      joinRows: [
        {
          dataValue: 'Frnce',
          selectedMapping: 'France',
          basemapOptions: ['Belgique', 'France', 'France'],
          candidates: [
            {
              id: 'FR',
              name: 'France',
              score: 0.92,
              type: 'partial' as const,
              variant: 'nom'
            },
            {
              id: 'BE',
              name: 'Belgique',
              score: 0.55,
              type: 'partial' as const,
              variant: 'nom'
            }
          ]
        }
      ],
      duplicates: [],
      unknowns: [],
      joinedCount: 0,
      toVerifyCount: 1,
      linkedVariableName: 'Country',
      basemapValues: ['France', 'Belgique'],
      onFinalizeJoin: vi.fn(),
      onMappingChange
    });

    const combobox = await screen.findByRole('combobox', {
      name: m.join_select_label_to_verify({ entity: 'Frnce' })
    });

    await waitFor(() =>
      expect((combobox as HTMLInputElement).value).toBe('France')
    );
    expect(requestAnimationFrameMock).not.toHaveBeenCalled();

    expect(
      screen.getByLabelText(m.join_match_score_label({ score: 92 }))
    ).toBeTruthy();

    await fireEvent.click(combobox);
    const option = await screen.findByRole('option', { name: 'Belgique' });
    await fireEvent.click(option);

    await waitFor(() =>
      expect(onMappingChange).toHaveBeenCalledWith(0, 'Belgique')
    );
  });
});
