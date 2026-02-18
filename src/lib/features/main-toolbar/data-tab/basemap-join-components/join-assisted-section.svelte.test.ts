import { cleanup, fireEvent, render } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import JoinAssistedSection from './join-assisted-section.svelte';
import { dataTabActions } from '$lib/features/commons/store/data-tab.store.svelte';

afterEach(cleanup);

interface TestProps {
  joinRows: {
    dataValue: string;
    selectedMapping: string;
    basemapOptions: string[];
  }[];
  duplicates: string[];
  unknowns: string[];
  joinedCount: number;
  toVerifyCount: number;
  linkedVariableName: string | undefined;
  loading: boolean;
  joinFinalized: boolean;
  onApplyCorrections: () => void;
  onFinalizeJoin: () => void;
}

describe('JoinAssistedSection', () => {
  function createProps(): TestProps {
    return {
      joinRows: [],
      duplicates: [],
      unknowns: [],
      joinedCount: 0,
      toVerifyCount: 0,
      linkedVariableName: undefined,
      loading: false,
      joinFinalized: false,
      onApplyCorrections: vi.fn(),
      onFinalizeJoin: vi.fn()
    };
  }

  it('displays all 4 category rows: joined, to_verify, not_unique, unrecognized', () => {
    const props = createProps();
    props.joinedCount = 10;
    props.toVerifyCount = 3;
    props.duplicates = ['EntityA', 'EntityB'];
    props.unknowns = ['Unknown1'];

    const { container } = render(JoinAssistedSection, { props });

    const joinedRow = container.querySelector('.category-row-joined');
    const verifyRow = container.querySelector('.category-row-verify');
    const duplicatesRow = container.querySelector('.category-row-duplicates');
    const unrecognizedRow = container.querySelector(
      '.category-row-unrecognized'
    );

    expect(joinedRow).not.toBeNull();
    expect(verifyRow).not.toBeNull();
    expect(duplicatesRow).not.toBeNull();
    expect(unrecognizedRow).not.toBeNull();
  });

  it('displays correct count for joined entities', () => {
    const props = createProps();
    props.joinedCount = 15;

    const { container } = render(JoinAssistedSection, { props });
    const joinedCount = container.querySelector(
      '.category-row-joined .category-count'
    );

    expect(joinedCount?.textContent).toBe('15');
  });

  it('displays correct count for to_verify entities', () => {
    const props = createProps();
    props.toVerifyCount = 5;

    const { container } = render(JoinAssistedSection, { props });
    const verifyCount = container.querySelector(
      '.category-row-verify .category-count'
    );

    expect(verifyCount?.textContent).toBe('5');
  });

  it('displays correct count for duplicate (not_unique) entities', () => {
    const props = createProps();
    props.duplicates = ['A', 'B', 'C'];

    const { container } = render(JoinAssistedSection, { props });
    const duplicatesCount = container.querySelector(
      '.category-row-duplicates .category-count'
    );

    expect(duplicatesCount?.textContent).toBe('3');
  });

  it('displays correct count for unrecognized entities', () => {
    const props = createProps();
    props.unknowns = ['X', 'Y'];

    const { container } = render(JoinAssistedSection, { props });
    const unrecognizedCount = container.querySelector(
      '.category-row-unrecognized .category-count'
    );

    expect(unrecognizedCount?.textContent).toBe('2');
  });

  it('displays duplicate entities list when expanded', async () => {
    const props = createProps();
    props.duplicates = ['France', 'Germany'];

    const { container } = render(JoinAssistedSection, { props });
    const duplicatesHeader = container.querySelector(
      '.category-row-duplicates .category-row-header'
    );

    await fireEvent.click(duplicatesHeader!);

    const entityItems = container.querySelectorAll(
      '.category-row-duplicates .entity-item'
    );
    expect(entityItems.length).toBe(2);
  });

  it('displays unrecognized entities list when expanded', async () => {
    const props = createProps();
    props.unknowns = ['UnknownCountry'];

    const { container } = render(JoinAssistedSection, { props });
    const unrecognizedHeader = container.querySelector(
      '.category-row-unrecognized .category-row-header'
    );

    await fireEvent.click(unrecognizedHeader!);

    const entityItems = container.querySelectorAll(
      '.category-row-unrecognized .entity-item'
    );
    expect(entityItems.length).toBe(1);
    expect(entityItems[0]?.textContent).toBe('UnknownCountry');
  });

  it('applies correct CSS classes for category status colors', () => {
    const props = createProps();
    props.joinedCount = 5;
    props.toVerifyCount = 2;
    props.duplicates = ['A'];
    props.unknowns = ['X'];

    const { container } = render(JoinAssistedSection, { props });

    expect(
      container.querySelector('.category-row-joined .count-success')
    ).not.toBeNull();
    expect(
      container.querySelector('.category-row-verify .count-warning')
    ).not.toBeNull();
    expect(
      container.querySelector('.category-row-duplicates .count-warning-alt')
    ).not.toBeNull();
    expect(
      container.querySelector('.category-row-unrecognized .count-error')
    ).not.toBeNull();
  });

  it('calls updateJoinMapping when selecting a mapping for a to_verify item', async () => {
    const updateJoinMappingSpy = vi
      .spyOn(dataTabActions, 'updateJoinMapping')
      .mockImplementation(() => {});
    const props = createProps();
    props.toVerifyCount = 2;
    props.joinRows = [
      {
        dataValue: 'Francia',
        selectedMapping: 'France',
        basemapOptions: ['France', 'French Guiana', 'French Polynesia']
      },
      {
        dataValue: 'Alemania',
        selectedMapping: 'Germany',
        basemapOptions: ['Germany']
      }
    ];

    const { container } = render(JoinAssistedSection, { props });

    const verifyHeader = container.querySelector(
      '.category-row-verify .category-row-header'
    );
    await fireEvent.click(verifyHeader!);

    const selectElement = container.querySelector(
      '.category-row-verify select'
    ) as HTMLSelectElement;
    expect(selectElement).not.toBeNull();

    await fireEvent.change(selectElement!, {
      target: { value: 'French Guiana' }
    });

    expect(updateJoinMappingSpy).toHaveBeenCalledTimes(1);
    expect(updateJoinMappingSpy).toHaveBeenCalledWith(0, 'French Guiana');

    updateJoinMappingSpy.mockRestore();
  });

  it('displays join table with correct data and options for to_verify items', async () => {
    const props = createProps();
    props.toVerifyCount = 2;
    props.linkedVariableName = 'Entity';
    props.joinRows = [
      {
        dataValue: 'Francia',
        selectedMapping: 'France',
        basemapOptions: ['France', 'French Guiana']
      },
      {
        dataValue: 'Alemania',
        selectedMapping: 'Germany',
        basemapOptions: ['Germany']
      }
    ];

    const { container } = render(JoinAssistedSection, { props });

    const verifyHeader = container.querySelector(
      '.category-row-verify .category-row-header'
    );
    await fireEvent.click(verifyHeader!);

    const dataCells = container.querySelectorAll(
      '.category-row-verify .cell-data'
    );
    expect(dataCells.length).toBe(2);
    expect(dataCells[0]?.textContent).toBe('Francia');
    expect(dataCells[1]?.textContent).toBe('Alemania');

    const selectElements = container.querySelectorAll(
      '.category-row-verify select'
    );
    expect(selectElements.length).toBe(2);
  });
});
