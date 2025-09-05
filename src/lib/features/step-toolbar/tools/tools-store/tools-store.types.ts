import type { AnnotationsState } from '../annotations/annotations.types';
import type { ColorBlindnessState } from '../color-blindness/color-blindness.types';
import type { FacetsState } from '../facets/facets.types';
import type { FormatState } from '../format/format.types';
import type { GeoIndicationsState } from '../geo-indications/geo-indications.types';
import type { LayersState } from '../layers/layers.types';
import type { LegendState } from '../legend/legend.types';
import type { ProjectionState } from '../projections/projections.types';
import type { SearchState } from '../search/search.types';
import type { SimplificationState } from '../simplification/simplification.types';

export interface ToolState {
  search: SearchState;
  layers: LayersState;
  facets: FacetsState;
  simplification: SimplificationState;
  format: FormatState;
  projection: ProjectionState;
  legend: LegendState;
  geoIndications: GeoIndicationsState;
  annotations: AnnotationsState;
  colorBlindness: ColorBlindnessState;
}

export type ToolName = keyof ToolState;
