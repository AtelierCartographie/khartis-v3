import { ANNOTATION_ROLE } from '$lib/features/commons/constants';
import { INTERNAL_COLUMN } from '$lib/features/commons/constants/data.constants';
import { SCALE_MODE } from '$lib/features/commons/constants/facets.constants';
import { AnnotationKind } from '$lib/features/commons/constants/ui.constants';
import { FillMode } from '$lib/features/commons/constants/visualization.constants';
import { resolveValueScopeClause } from '$lib/features/commons/services/row-scope.service';
import { datasetsStore } from '$lib/features/commons/stores/datasets.store.svelte';
import { globalActions } from '$lib/features/commons/stores/global.svelte';
import { projectStore } from '$lib/features/commons/stores/project.store.svelte';
import { visualizationStore } from '$lib/features/commons/stores/visualization.store.svelte';
import {
  getPolygonPrimitive,
  getPrimitiveClassification,
  getPrimitiveValueColumn
} from '$lib/features/commons/stores/visualization-normalize';
import {
  type ClassificationConfig,
  PrimitiveFilterType
} from '$lib/features/commons/stores/visualization.types';
import { DEFAULT_DISCRETIZATION_CLASS_COUNT } from '$lib/features/commons/constants/visualization.constants';
import { ToolbarStep } from '$lib/features/commons/types/global';
import { resolveRequestedClassCount } from '$lib/features/commons/utils/discretization.utils';
import {
  annotationsActions,
  closeSelectedToolPanel,
  facetsStore,
  getAnnotationsState,
  getLegendState,
  getPageElementPlaceholder,
  LEGEND_ID_PREFIXES,
  legendActions
} from '$lib/features/step-toolbar';
import {
  buildClassificationUpdate,
  computeClassificationBreaks,
  resetClassificationComputedValues,
  syncLegendSubtitleAfterMappingChange
} from '$lib/features/visualization-tab';
import { listCalculatedColumns } from '../contract/project-snapshot';
import type { AgentTool, AgentToolResult } from '../contract/types';
import {
  AGENT_CLASS_COUNT,
  AGENT_CLASSIFICATION_METHODS,
  AGENT_STEPS,
  AGENT_TEXT_LIMITS,
  parseGoToStepInput,
  parseLayoutTextsInput,
  parseLegendTextsInput,
  parseSetTextInput,
  parseSetChoroplethVariableInput,
  parseUpdateClassificationInput,
  refuseForChoropleth,
  type ChoroplethVariableChange,
  type ClassificationChange,
  type LayoutTextsChange,
  type LegendTextsChange,
  type TextChange
} from '../contract/validation';
import { listColumnNatures } from './column-natures';
import { failure, REVISION_PROPERTY, runEdit } from './edit-guard';

function isAgentMethod(method: string | undefined): boolean {
  return AGENT_CLASSIFICATION_METHODS.some((candidate) => candidate === method);
}

// As in the discretization panel, the base of a collection with shared
// classes is classed on all its variables; the maps of the collection then
// recompute the same shared classes.
function resolvePooledColumnNames(
  visualizationId: string,
  valueColumn: string
): string[] | undefined {
  return facetsStore.enabled &&
    facetsStore.scaleMode === SCALE_MODE.SHARED &&
    facetsStore.baseVisualizationId === visualizationId &&
    facetsStore.variables.includes(valueColumn)
    ? [...facetsStore.variables]
    : undefined;
}

function findClassedPolygon(visualizationId: string) {
  const visualization = visualizationStore.visualizations.find(
    (item) => item.id === visualizationId && !item.facet
  );
  const polygon = visualization && getPolygonPrimitive(visualization);
  if (!visualization || !polygon?.enabled) return null;
  return {
    visualization,
    classed: polygon.fillMode === FillMode.CLASSES,
    valueColumn: getPrimitiveValueColumn(
      visualization,
      PrimitiveFilterType.POLYGON
    )
  };
}

async function applyClassificationChange(
  change: ClassificationChange
): Promise<AgentToolResult> {
  if (
    !visualizationStore.visualizations.some(
      (item) => item.id === change.visualizationId && !item.facet
    )
  ) {
    return failure('not_found', 'No visualization has this id.');
  }

  const target = findClassedPolygon(change.visualizationId);
  if (!target?.classed) {
    return failure(
      'unsupported',
      'This prototype changes the classes of a polygon fill in classes only.'
    );
  }

  const { visualization, valueColumn } = target;
  const dataset = datasetsStore.datasets.find(
    (item) => item.id === visualization.datasetId
  );
  if (!valueColumn || !dataset?.sourceFileId) {
    return failure('unavailable', 'The classed column is not loaded yet.');
  }

  const current = getPrimitiveClassification(
    visualization,
    PrimitiveFilterType.POLYGON
  );
  const method = change.method ?? current?.method;
  if (!method || !isAgentMethod(method)) {
    return failure(
      'unsupported',
      'The current classes use manual bounds or calendar steps: give a method to replace them.'
    );
  }

  const classes = resolveRequestedClassCount(
    method,
    change.classes ??
      current?.numClasses ??
      current?.classes ??
      DEFAULT_DISCRETIZATION_CLASS_COUNT
  );
  const next: ClassificationConfig = {
    ...current,
    method,
    classes,
    numClasses: classes,
    paletteId: change.paletteId ?? current?.paletteId,
    // A palette picked from the menu starts the right way round.
    inverted:
      change.inverted ??
      (change.paletteId !== undefined ? false : (current?.inverted ?? false))
  };
  // The engine keeps the stored colors while breaks are unchanged, so a new
  // palette or inversion needs them regenerated, as the palette menu does.
  const recolor =
    change.paletteId !== undefined || change.inverted !== undefined;

  const computation = await computeClassificationBreaks({
    datasetSourceFileId: dataset.sourceFileId,
    valueColumn,
    rowScopeClause: resolveValueScopeClause({
      datasetId: dataset.sourceFileId,
      vizFilters: visualization.dataFilters,
      primitive: PrimitiveFilterType.POLYGON
    }),
    classification: recolor ? { ...next, colors: undefined } : next,
    method,
    numClasses: classes,
    pooledColumnNames: resolvePooledColumnNames(visualization.id, valueColumn)
  });
  if (!computation) {
    return failure(
      'unavailable',
      'The engine could not compute classes for this column.'
    );
  }

  // The user may have changed the visualization while the engine computed.
  const latest = findClassedPolygon(visualization.id);
  if (!latest?.classed || latest.valueColumn !== valueColumn) {
    return failure(
      'conflict',
      'The visualization changed while its classes were computed: read the project again.'
    );
  }

  visualizationStore.updateClassification(visualization.id, {
    method,
    classes,
    numClasses: classes,
    paletteId: next.paletteId,
    inverted: next.inverted,
    ...buildClassificationUpdate(computation, next, method)
  });
  await facetsStore.syncGeneratedVisualizationsFromBase(visualization.id);

  return {
    ok: true,
    data: {
      visualization_id: visualization.id,
      classification: {
        method: computation.normalizedMethod,
        classes: computation.actualClassCount,
        palette_id: next.paletteId ?? null,
        inverted: next.inverted
      }
    }
  };
}

const INTERNAL_COLUMN_NAMES = new Set<string>(Object.values(INTERNAL_COLUMN));

// Same writes as the variable picker of the panel, then the classes are
// computed for the new column with the current settings.
async function applyChoroplethVariable(
  change: ChoroplethVariableChange
): Promise<AgentToolResult> {
  const target = findClassedPolygon(change.visualizationId);
  if (!target) {
    return failure('not_found', 'No visualization has this id.');
  }
  if (!target.classed) {
    return failure(
      'unsupported',
      'This tool changes the variable of a polygon fill in classes (choropleth) only.'
    );
  }
  const { visualization } = target;
  if (
    facetsStore.enabled &&
    facetsStore.baseVisualizationId === visualization.id
  ) {
    return failure(
      'unsupported',
      'This visualization is the base of a map collection: its variables are chosen in the collection panel.'
    );
  }
  const dataset = datasetsStore.datasets.find(
    (item) => item.id === visualization.datasetId
  );
  if (!dataset) {
    return failure('unavailable', 'The dataset is not loaded yet.');
  }

  const calculated = listCalculatedColumns(
    projectStore.currentProject?.data?.sourceFiles?.find(
      (file) => file.id === dataset.sourceFileId
    )?.columnTransformations
  ).map((column) => column.name);
  const columns = new Set([
    ...dataset.columns
      .map((column) => column.name)
      .filter((name) => !INTERNAL_COLUMN_NAMES.has(name)),
    ...calculated
  ]);
  if (!columns.has(change.column)) {
    return failure(
      'not_found',
      'No column has this name: give a column or a calculated column from inspect_project.'
    );
  }
  const nature = listColumnNatures(dataset).get(change.column);
  const refusal = refuseForChoropleth(nature);
  if (refusal) {
    return failure('unsupported', `${change.column} ${refusal}`);
  }
  if (target.valueColumn === change.column) {
    return {
      ok: true,
      data: {
        visualization_id: visualization.id,
        column: change.column,
        unchanged: true
      }
    };
  }

  const polygon = getPolygonPrimitive(visualization);
  if (!polygon) {
    return failure('unsupported', 'This visualization has no polygon fill.');
  }
  const restore = {
    classification: visualization.classification,
    polygon,
    mapping: visualization.mapping
  };
  visualizationStore.updateVisualization(visualization.id, {
    classification: resetClassificationComputedValues(
      visualization.classification
    ),
    polygon: {
      ...polygon,
      valueColumn: change.column,
      classification: resetClassificationComputedValues(polygon.classification)
    },
    mapping: { ...visualization.mapping, valueColumn: change.column }
  });
  const updated = visualizationStore.visualizations.find(
    (item) => item.id === visualization.id
  );
  if (updated) {
    syncLegendSubtitleAfterMappingChange(
      PrimitiveFilterType.POLYGON,
      visualization,
      updated
    );
  }

  const classes = await applyClassificationChange({
    visualizationId: visualization.id
  });
  if (!classes.ok) {
    // A column the engine cannot class leaves the map as it was.
    visualizationStore.updateVisualization(visualization.id, restore);
    return classes;
  }
  const legend = getLegendState().items.find((item) =>
    item.id.startsWith(`${LEGEND_ID_PREFIXES.VIZ}${visualization.id}--`)
  );
  return {
    ok: true,
    data: {
      visualization_id: visualization.id,
      column: change.column,
      nature: nature ?? null,
      classification: classes.data.classification,
      legend_title_kept: legend?.titleMode === 'custom'
    }
  };
}

// A cleared page text goes back to its placeholder, as in the text tool; the
// export leaves placeholders out.
function resolveTextContent(
  role: Parameters<typeof getPageElementPlaceholder>[0] | undefined,
  text: string
): string {
  return (text === '' && role ? getPageElementPlaceholder(role) : null) ?? text;
}

const LAYOUT_ROLES = {
  title: ANNOTATION_ROLE.TITLE,
  subtitle: ANNOTATION_ROLE.SUBTITLE,
  source: ANNOTATION_ROLE.SOURCE
} as const;

function applyLayoutTexts(change: LayoutTextsChange): AgentToolResult {
  if (!projectStore.currentProject) {
    return failure('unavailable', 'No project is open.');
  }
  // Same first-time setup as the Styling step: page texts exist once laid out.
  if (!getAnnotationsState().items.some((item) => item.role != null)) {
    annotationsActions.initPageElements({
      withPlaceholders: true,
      visible: true
    });
  }

  const written: string[] = [];
  const missing: string[] = [];
  for (const field of Object.keys(change) as (keyof LayoutTextsChange)[]) {
    const item = getAnnotationsState().items.find(
      (annotation) => annotation.role === LAYOUT_ROLES[field]
    );
    if (!item) {
      missing.push(field);
      continue;
    }
    annotationsActions.updateAnnotation(item.id, {
      content: resolveTextContent(item.role, change[field] ?? '')
    });
    written.push(field);
  }

  return { ok: true, data: { written, missing_on_page: missing } };
}

function applyText(change: TextChange): AgentToolResult {
  const item = getAnnotationsState().items.find(
    (annotation) =>
      annotation.id === change.textId && annotation.type === AnnotationKind.TEXT
  );
  if (!item) {
    return failure('not_found', 'No text on the page has this id.');
  }
  annotationsActions.updateAnnotation(item.id, {
    content: resolveTextContent(item.role, change.text)
  });
  return { ok: true, data: { text_id: item.id } };
}

function applyLegendTexts(change: LegendTextsChange): AgentToolResult {
  const legend = getLegendState().items.find(
    (item) => item.id === change.legendId
  );
  if (!legend) {
    return failure('not_found', 'No legend has this id.');
  }

  const updates: Parameters<typeof legendActions.updateLegendItem>[1] = {};
  // A custom mode keeps the text when the visualization changes.
  if (change.title !== undefined) {
    updates.title = change.title;
    updates.titleMode = 'custom';
  }
  if (change.subtitle !== undefined) {
    updates.subtitle = change.subtitle;
    updates.subtitleMode = 'custom';
  }
  if (change.note !== undefined) {
    updates.note = change.note;
  }
  legendActions.updateLegendItem(legend.id, updates);

  return { ok: true, data: { legend_id: legend.id } };
}

function goToStep(step: ToolbarStep): AgentToolResult {
  const project = projectStore.currentProject;
  if (!project) {
    return failure('unavailable', 'No project is open.');
  }
  if (step !== ToolbarStep.Data && !project.data?.sourceFiles?.length) {
    return failure('unavailable', 'Import data before leaving the Data step.');
  }
  closeSelectedToolPanel();
  globalActions.setNavigationState(step);
  return { ok: true, data: { step } };
}

const textProperty = (description: string, maxLength: number) => ({
  type: 'string',
  maxLength,
  description
});

export const updateClassificationTool: AgentTool = {
  name: 'update_classification',
  title: 'Change the classes of a choropleth',
  description:
    'Change how a polygon fill in classes (choropleth) is classified: method, number of classes, palette, inversion. Khartis computes the breaks and colors itself, like the classification panel; a new palette starts the right way round unless inverted is given. Give the visualization id from inspect_project and at least one setting. Palettes must come from capabilities.class_palettes of inspect_project.',
  inputSchema: {
    type: 'object',
    properties: {
      visualization_id: { type: 'string' },
      method: {
        type: 'string',
        enum: [...AGENT_CLASSIFICATION_METHODS],
        description:
          'quantiles: equal counts; equal_interval: equal ranges; kmeans: natural groups; q6: extremes apart; nested_means: around means; head_tail: skewed data.'
      },
      classes: {
        type: 'integer',
        minimum: AGENT_CLASS_COUNT.min,
        maximum: AGENT_CLASS_COUNT.max
      },
      palette_id: { type: 'string' },
      inverted: { type: 'boolean' },
      expected_revision: REVISION_PROPERTY
    },
    required: ['visualization_id'],
    additionalProperties: false
  },
  annotations: {},
  execute: (input) =>
    runEdit(input, parseUpdateClassificationInput, applyClassificationChange)
};

export const setChoroplethVariableTool: AgentTool = {
  name: 'set_choropleth_variable',
  title: 'Map another column with a choropleth',
  description:
    'Map another column with the same choropleth, as the variable picker of its panel does: Khartis recomputes the classes and colors with the current method, class count and palette. Give a column or calculated column from inspect_project. A count or a category is refused, since a choropleth classes ratios: for a count, apply the proportional symbols suggestion. A custom legend title is kept (legend_title_kept): rewrite it with set_legend_texts if it names the old variable.',
  inputSchema: {
    type: 'object',
    properties: {
      visualization_id: { type: 'string' },
      column: {
        type: 'string',
        description: 'Column or calculated column name from inspect_project.'
      },
      expected_revision: REVISION_PROPERTY
    },
    required: ['visualization_id', 'column'],
    additionalProperties: false
  },
  annotations: {},
  execute: (input) =>
    runEdit(input, parseSetChoroplethVariableInput, applyChoroplethVariable)
};

export const setLayoutTextsTool: AgentTool = {
  name: 'set_layout_texts',
  title: 'Write the page texts',
  description:
    'Write the title, subtitle or source shown on the map page. Plain text; an empty string brings back the placeholder, which the export leaves out. Texts are laid out on the page the same way as when the user types them.',
  inputSchema: {
    type: 'object',
    properties: {
      title: textProperty('Map title.', AGENT_TEXT_LIMITS.title),
      subtitle: textProperty('Map subtitle.', AGENT_TEXT_LIMITS.subtitle),
      source: textProperty(
        'Data source, may span lines.',
        AGENT_TEXT_LIMITS.source
      ),
      expected_revision: REVISION_PROPERTY
    },
    additionalProperties: false
  },
  annotations: {},
  execute: (input) => runEdit(input, parseLayoutTextsInput, applyLayoutTexts)
};

export const setTextTool: AgentTool = {
  name: 'set_text',
  title: 'Rewrite a text on the page',
  description:
    'Replace the content of one text on the map page, given its id from the texts list of inspect_project. Use it for a title or source written as a free text, which set_layout_texts reports as missing_on_page. Plain text, may span lines.',
  inputSchema: {
    type: 'object',
    properties: {
      text_id: { type: 'string' },
      text: textProperty('New content of the text.', AGENT_TEXT_LIMITS.note),
      expected_revision: REVISION_PROPERTY
    },
    required: ['text_id', 'text'],
    additionalProperties: false
  },
  annotations: {},
  execute: (input) => runEdit(input, parseSetTextInput, applyText)
};

export const setLegendTextsTool: AgentTool = {
  name: 'set_legend_texts',
  title: 'Write the texts of a legend',
  description:
    'Write the title, subtitle or note of one legend, given its id from inspect_project. Plain text. A written title or subtitle stays when the visualization changes.',
  inputSchema: {
    type: 'object',
    properties: {
      legend_id: { type: 'string' },
      title: textProperty('Legend title.', AGENT_TEXT_LIMITS.title),
      subtitle: textProperty(
        'Legend subtitle, often the unit.',
        AGENT_TEXT_LIMITS.subtitle
      ),
      note: textProperty('Legend note.', AGENT_TEXT_LIMITS.note),
      expected_revision: REVISION_PROPERTY
    },
    required: ['legend_id'],
    additionalProperties: false
  },
  annotations: {},
  execute: (input) => runEdit(input, parseLegendTextsInput, applyLegendTexts)
};

export const goToStepTool: AgentTool = {
  name: 'go_to_step',
  title: 'Open a step of Khartis',
  description:
    'Show one of the three steps of the map workflow: data (import, geolocation, join), visualizations (choose and set up), styling (page texts, legend, layout). Page texts and legends are seen on the page at the styling step.',
  inputSchema: {
    type: 'object',
    properties: { step: { type: 'string', enum: [...AGENT_STEPS] } },
    required: ['step'],
    additionalProperties: false
  },
  annotations: {},
  async execute(input) {
    const parsed = parseGoToStepInput(input);
    return parsed.ok ? goToStep(parsed.value.step) : parsed;
  }
};
