export interface FacetsState {
  variables: string[];
  selectedVariables: string[];
  collections: Array<{
    id: string;
    name: string;
    variables: string[];
  }>;
  layout: 'grid' | 'horizontal' | 'vertical';
  spacing: number;
}
