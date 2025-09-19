import type { FacetsState } from './facets.types';

const FIXTURE_VARIABLES = [
  'Population',
  'PIB par habitant',
  'Taux de chômage',
  'Densité de population',
  'Superficie'
];

const FIXTURE_COLLECTIONS = [
  {
    id: 'collection-1',
    name: 'Indicateurs économiques',
    variables: ['PIB par habitant', 'Taux de chômage']
  },
  {
    id: 'collection-2',
    name: 'Données démographiques',
    variables: ['Population', 'Densité de population']
  }
];

const DEFAULT_STATE: FacetsState = {
  variables: [...FIXTURE_VARIABLES],
  selectedVariables: ['Population', 'PIB par habitant'],
  collections: [...FIXTURE_COLLECTIONS],
  layout: 'grid',
  spacing: 4
};

export const facetsState = $state<FacetsState>({ ...DEFAULT_STATE });

export const facetsActions = {
  setState(newState: Partial<FacetsState>): void {
    Object.assign(facetsState, newState);
  },

  addVariable(variable: string): void {
    if (!facetsState.variables.includes(variable)) {
      facetsState.variables.push(variable);
    }
  },

  removeVariable(variable: string): void {
    facetsState.variables = facetsState.variables.filter((v) => v !== variable);
    facetsState.selectedVariables = facetsState.selectedVariables.filter(
      (v) => v !== variable
    );
  },

  selectVariable(variable: string): void {
    if (!facetsState.selectedVariables.includes(variable)) {
      facetsState.selectedVariables.push(variable);
    }
  },

  unselectVariable(variable: string): void {
    facetsState.selectedVariables = facetsState.selectedVariables.filter(
      (v) => v !== variable
    );
  },

  toggleVariableSelection(variable: string): void {
    if (facetsState.selectedVariables.includes(variable)) {
      this.unselectVariable(variable);
    } else {
      this.selectVariable(variable);
    }
  },

  createCollection(name: string, variables: string[]): void {
    const newCollection = {
      id: `collection-${Date.now()}`,
      name,
      variables: variables.filter((v) => facetsState.variables.includes(v))
    };

    facetsState.collections.push(newCollection);
  },

  updateCollection(
    id: string,
    updates: Partial<{ name: string; variables: string[] }>
  ): void {
    const collection = facetsState.collections.find((c) => c.id === id);
    if (collection) {
      Object.assign(collection, updates);
    }
  },

  removeCollection(id: string): void {
    const collection = facetsState.collections.find((c) => c.id === id);
    facetsState.collections = facetsState.collections.filter(
      (c) => c.id !== id
    );
  },

  setLayout(layout: 'grid' | 'horizontal' | 'vertical'): void {
    facetsState.layout = layout;
  },

  setSpacing(spacing: number): void {
    facetsState.spacing = Math.max(0, Math.min(10, spacing));
  },

  clearSelection(): void {
    facetsState.selectedVariables = [];
  },

  selectAll(): void {
    facetsState.selectedVariables = [...facetsState.variables];
  },

  reset(): void {
    Object.assign(facetsState, DEFAULT_STATE);
  }
};

export function getSelectedVariablesCount(): number {
  return facetsState.selectedVariables.length;
}

export function getCollectionByVariable(variable: string) {
  return facetsState.collections.find((collection) =>
    collection.variables.includes(variable)
  );
}
