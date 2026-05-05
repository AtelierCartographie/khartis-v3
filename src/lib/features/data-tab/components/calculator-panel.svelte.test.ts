import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as m from '$lib/paraglide/messages';

const mocks = vi.hoisted(() => {
  const dataToolsState = {
    calculatorName: '',
    calculatorFormula: '',
    calculatorTestResult: null as unknown,
    calculatorError: null as string | null
  };

  return {
    dataToolsState,
    addCalculatedColumnMock: vi.fn(),
    addColumnTransformationMock: vi.fn(),
    refreshDatasetMetadataMock: vi.fn(),
    recordTransformationMock: vi.fn(),
    resetCalculatorMock: vi.fn(() => {
      dataToolsState.calculatorName = '';
      dataToolsState.calculatorFormula = '';
      dataToolsState.calculatorTestResult = null;
      dataToolsState.calculatorError = null;
    }),
    setCalculatorNameMock: vi.fn((value: string) => {
      dataToolsState.calculatorName = value;
    }),
    setCalculatorFormulaMock: vi.fn((value: string) => {
      dataToolsState.calculatorFormula = value;
    }),
    setCalculatorTestResultMock: vi.fn((value: unknown) => {
      dataToolsState.calculatorTestResult = value;
      dataToolsState.calculatorError = null;
    }),
    setCalculatorErrorMock: vi.fn((value: string | null) => {
      dataToolsState.calculatorError = value;
      dataToolsState.calculatorTestResult = null;
    })
  };
});

vi.mock('../data-tools.store.svelte', () => ({
  dataToolsStore: {
    get calculatorName() {
      return mocks.dataToolsState.calculatorName;
    },
    get calculatorFormula() {
      return mocks.dataToolsState.calculatorFormula;
    },
    get calculatorTestResult() {
      return mocks.dataToolsState.calculatorTestResult;
    },
    get calculatorError() {
      return mocks.dataToolsState.calculatorError;
    },
    setCalculatorName: (value: string) => mocks.setCalculatorNameMock(value),
    setCalculatorFormula: (value: string) =>
      mocks.setCalculatorFormulaMock(value),
    setCalculatorTestResult: (value: unknown) =>
      mocks.setCalculatorTestResultMock(value),
    setCalculatorError: (value: string | null) =>
      mocks.setCalculatorErrorMock(value),
    resetCalculator: () => mocks.resetCalculatorMock()
  }
}));

vi.mock('$lib/features/commons/stores/datasets.store.svelte', () => ({
  datasetsStore: {
    get selectedDataset() {
      return {
        id: 'dataset-1',
        sourceFileId: 'source-1',
        columns: [
          { name: 'country', type: 'TEXT' },
          { name: 'amount', type: 'DOUBLE' }
        ]
      };
    },
    recordTransformation: (datasetId: string, description: string) =>
      mocks.recordTransformationMock(datasetId, description)
  }
}));

vi.mock('$lib/features/commons/utils/sanitize.utils', async () => {
  const actual = await vi.importActual<
    typeof import('$lib/features/commons/utils/sanitize.utils')
  >('$lib/features/commons/utils/sanitize.utils');

  return {
    ...actual,
    escapeIdentifier: (value: string) => value
  };
});

vi.mock('$lib/features/commons/utils/logger', () => ({
  LogCategory: {
    DATA: 'DATA'
  },
  logger: {
    error: vi.fn()
  }
}));

vi.mock('$lib/features/commons/constants/data.constants', () => ({
  INTERNAL_COLUMN: {
    GEOM: '__geom__',
    ID: '__id__'
  },
  COLUMN_TYPE_GEOMETRY: 'GEOMETRY'
}));

vi.mock('$lib/features/commons/stores/project.store.svelte', () => ({
  projectStore: {
    addColumnTransformation: (...args: unknown[]) =>
      mocks.addColumnTransformationMock(...args)
  }
}));

vi.mock('../services/dataset-metadata', () => ({
  refreshDatasetMetadata: (...args: unknown[]) =>
    mocks.refreshDatasetMetadataMock(...args)
}));

vi.mock('$lib/features/duckdb/orchestrator/orchestrator.svelte', () => ({
  duckDBOrchestrator: {
    addCalculatedColumn: (...args: unknown[]) =>
      mocks.addCalculatedColumnMock(...args),
    testExpression: vi.fn()
  }
}));

import CalculatorPanel from './calculator-panel.svelte';

describe('calculator-panel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.dataToolsState.calculatorName = '';
    mocks.dataToolsState.calculatorFormula = '';
    mocks.dataToolsState.calculatorTestResult = null;
    mocks.dataToolsState.calculatorError = null;
    mocks.addCalculatedColumnMock.mockResolvedValue(undefined);
    mocks.addColumnTransformationMock.mockResolvedValue(undefined);
    mocks.refreshDatasetMetadataMock.mockResolvedValue(undefined);
  });

  it('records a dataset transformation after creating a calculated column', async () => {
    const onColumnCreated = vi.fn();

    render(CalculatorPanel, {
      tableName: 'fossil_fuel_subsidies',
      onColumnCreated
    });

    await fireEvent.input(screen.getByLabelText(m.calc_variable_name()), {
      target: { value: 'helper_ratio' }
    });

    await fireEvent.input(screen.getByLabelText(m.calc_formula()), {
      target: { value: '"amount" * 2' }
    });

    await fireEvent.click(
      screen.getByRole('button', { name: m.calc_calculate() })
    );

    await waitFor(() => {
      expect(mocks.addCalculatedColumnMock).toHaveBeenCalledWith(
        'fossil_fuel_subsidies',
        'helper_ratio',
        '"amount" * 2'
      );
    });

    expect(mocks.recordTransformationMock).toHaveBeenCalledWith(
      'dataset-1',
      m.calculated_column_created({ name: 'helper_ratio' })
    );
    expect(mocks.addColumnTransformationMock).toHaveBeenCalledTimes(1);
    expect(mocks.refreshDatasetMetadataMock).toHaveBeenCalledWith(
      'dataset-1',
      'fossil_fuel_subsidies',
      { force: true }
    );
    expect(onColumnCreated).toHaveBeenCalledTimes(1);
    expect(mocks.resetCalculatorMock).toHaveBeenCalledTimes(1);
  });
});
