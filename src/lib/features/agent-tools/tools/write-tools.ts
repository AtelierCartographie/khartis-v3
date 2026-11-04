import { tick } from 'svelte';
import { ANNOTATION_ROLE } from '$lib/features/commons/constants';
import { SCALE_MODE } from '$lib/features/commons/constants/facets.constants';
import { AnnotationKind } from '$lib/features/commons/constants/ui.constants';
import {
  DEFAULT_DISCRETIZATION_CLASS_COUNT,
  FillMode
} from '$lib/features/commons/constants/visualization.constants';
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
  ClassificationMethod,
  type ClassificationConfig,
  type PolygonPrimitiveConfig,
  PrimitiveFilterType,
  type VisualizationConfig
} from '$lib/features/commons/stores/visualization.types';
import { ToolbarStep } from '$lib/features/commons/types/global';
import {
  DEFAULT_DISCRETIZATION_CLASS_COUNT_MAX,
  resolveRequestedClassCount
} from '$lib/features/commons/utils/discretization.utils';
import { filterVisualizableDataColumns } from '$lib/features/commons/utils/visualization-columns.utils';
import {
  annotationsActions,
  closeSelectedToolPanel,
  facetsStore,
  getAnnotationsState,
  getLegendState,
  getPageElementPlaceholder,
  legendActions
} from '$lib/features/step-toolbar';
import {
  buildClassificationUpdate,
  computeClassificationBreaks,
  resetClassificationComputedValues,
  syncLegendSubtitleAfterMappingChange
} from '$lib/features/visualization-tab';
import { listCalculatedColumns } from '../contract/project-snapshot';
import {
  failure,
  NO_PROJECT,
  type AgentTool,
  type AgentToolResult,
  type Parsed
} from '../contract/types';
import {
  AGENT_CLASS_COUNT,
  AGENT_CLASSIFICATION_METHODS,
  AGENT_STEPS,
  AGENT_TEXT_LIMITS,
  CLASS_PALETTE_IDS,
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
import {
  type Commit,
  REVISION_PROPERTY,
  runEdit,
  STALE_FAILURE
} from './edit-guard';
import { listVisualizationLegends } from './legends';
import { readProjectSnapshot } from './read-tools';

type Dataset = (typeof datasetsStore.datasets)[number];

interface Choropleth {
  visualization: VisualizationConfig;
  polygon: PolygonPrimitiveConfig;
  dataset: Dataset;
  sourceFileId: string;
}

// A polygon fill in classes, on a visualization the agent reads: the maps
// generated for a collection repeat their base.
function findChoropleth(visualizationId: string): Parsed<Choropleth> {
  const visualization = visualizationStore.visualizations.find(
    (item) => item.id === visualizationId && !item.facet
  );
  if (!visualization) {
    return failure('not_found', 'No visualization has this id.');
  }
  const polygon = getPolygonPrimitive(visualization);
  if (!polygon?.enabled || polygon.fillMode !== FillMode.CLASSES) {
    return failure(
      'unsupported',
      'This tool works on a polygon fill in classes (choropleth) only.'
    );
  }
  const dataset = datasetsStore.datasets.find(
    (item) => item.id === visualization.datasetId
  );
  if (!dataset?.sourceFileId) {
    return failure(
      'unavailable',
      'The dataset of this visualization is not loaded yet.'
    );
  }
  return {
    ok: true,
    value: {
      visualization,
      polygon,
      dataset,
      sourceFileId: dataset.sourceFileId
    }
  };
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

interface ComputedClasses {
  update: Partial<ClassificationConfig>;
  summary: {
    method: ClassificationMethod;
    classes: number;
    palette_id: string | null;
    inverted: boolean;
  };
}

/**
 * Computes, without writing, the classes of a column from the requested
 * settings and the current ones, as the classification panel does.
 */
async function computeClasses(
  { visualization, sourceFileId }: Choropleth,
  valueColumn: string,
  current: ClassificationConfig | undefined,
  settings: Omit<ClassificationChange, 'visualizationId'>
): Promise<Parsed<ComputedClasses>> {
  // Manual bounds depend on values the agent does not see. A calendar method
  // is left to the engine, which keeps it for dates and drops it for numbers.
  const method = settings.method ?? current?.method;
  if (!method || method === ClassificationMethod.MANUAL) {
    return failure(
      'unsupported',
      'The current classes use manual bounds: give a method to replace them.'
    );
  }

  const classes = resolveRequestedClassCount(
    method,
    settings.classes ??
      // As in the discretization panel, head/tail asks for the largest
      // count and keeps the classes the distribution gives.
      (settings.method === ClassificationMethod.HEAD_TAIL
        ? DEFAULT_DISCRETIZATION_CLASS_COUNT_MAX
        : undefined) ??
      current?.numClasses ??
      current?.classes ??
      DEFAULT_DISCRETIZATION_CLASS_COUNT
  );
  // Classes split at a breakpoint are drawn with a diverging ramp: the engine
  // would replace a sequential palette by its default diverging one.
  if (
    settings.paletteId !== undefined &&
    Number.isFinite(current?.breakpointValue) &&
    !CLASS_PALETTE_IDS.diverging.includes(settings.paletteId)
  ) {
    return failure(
      'unsupported',
      'These classes split at a breakpoint, so the map draws a diverging palette: choose one from capabilities.class_palettes.diverging.'
    );
  }
  const paletteId = settings.paletteId ?? current?.paletteId;
  // A palette picked from the menu starts the right way round.
  const inverted =
    settings.inverted ??
    (settings.paletteId !== undefined ? false : (current?.inverted ?? false));
  // A hand-built ramp has no palette id: inverting flips its colors, as the
  // panel does. A palette is regenerated instead, since the engine keeps the
  // stored colors while the breaks do not change.
  const handBuilt = !paletteId && Boolean(current?.colors?.length);
  const flipped = inverted !== (current?.inverted ?? false);
  const recolor =
    !handBuilt &&
    (settings.paletteId !== undefined || settings.inverted !== undefined);
  const next: ClassificationConfig = {
    ...current,
    method,
    classes,
    numClasses: classes,
    paletteId,
    inverted,
    colors:
      handBuilt && flipped
        ? [...(current?.colors ?? [])].reverse()
        : recolor
          ? undefined
          : current?.colors
  };

  const computation = await computeClassificationBreaks({
    datasetSourceFileId: sourceFileId,
    valueColumn,
    rowScopeClause: resolveValueScopeClause({
      datasetId: sourceFileId,
      vizFilters: visualization.dataFilters,
      primitive: PrimitiveFilterType.POLYGON
    }),
    classification: next,
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
  return {
    ok: true,
    value: {
      update: {
        method,
        classes,
        numClasses: classes,
        paletteId,
        inverted,
        ...buildClassificationUpdate(computation, next, method)
      },
      summary: {
        method: computation.normalizedMethod,
        classes: computation.actualClassCount,
        palette_id: paletteId ?? null,
        inverted
      }
    }
  };
}

async function applyClassificationChange(
  change: ClassificationChange,
  commit: Commit
): Promise<AgentToolResult> {
  const found = findChoropleth(change.visualizationId);
  if (!found.ok) return found;
  const { visualization } = found.value;
  const valueColumn = getPrimitiveValueColumn(
    visualization,
    PrimitiveFilterType.POLYGON
  );
  if (!valueColumn) {
    return failure(
      'unavailable',
      'This choropleth maps no column yet: give one with set_choropleth_variable.'
    );
  }

  const classes = await computeClasses(
    found.value,
    valueColumn,
    getPrimitiveClassification(visualization, PrimitiveFilterType.POLYGON),
    change
  );
  if (!classes.ok) return classes;
  const written = await commit(() => {
    visualizationStore.updateClassification(
      visualization.id,
      classes.value.update
    );
  });
  if (!written) return STALE_FAILURE;
  await facetsStore.syncGeneratedVisualizationsFromBase(visualization.id);

  return {
    ok: true,
    data: {
      visualization_id: visualization.id,
      classification: classes.value.summary
    }
  };
}

// The writes of the variable picker of the panel, with the classes it then
// computes, in one go: the map never shows the new column without classes,
// and a column the engine cannot class leaves the map as it was.
async function applyChoroplethVariable(
  change: ChoroplethVariableChange,
  commit: Commit
): Promise<AgentToolResult> {
  const found = findChoropleth(change.visualizationId);
  if (!found.ok) return found;
  const { visualization, polygon, dataset } = found.value;
  if (
    facetsStore.enabled &&
    facetsStore.baseVisualizationId === visualization.id
  ) {
    return failure(
      'unsupported',
      'This visualization is the base of a map collection: its variables are chosen in the collection panel.'
    );
  }

  const calculated = listCalculatedColumns(
    projectStore.currentProject?.data?.sourceFiles?.find(
      (file) => file.id === dataset.sourceFileId
    )?.columnTransformations
  );
  if (
    !calculated.includes(change.column) &&
    !filterVisualizableDataColumns(dataset.columns).some(
      (column) => column.name === change.column
    )
  ) {
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
  if (
    getPrimitiveValueColumn(visualization, PrimitiveFilterType.POLYGON) ===
    change.column
  ) {
    return {
      ok: true,
      data: {
        visualization_id: visualization.id,
        column: change.column,
        unchanged: true
      }
    };
  }

  // As in the picker, what belonged to the previous column goes: manual
  // bounds, breakpoint and colors.
  const classes = await computeClasses(
    found.value,
    change.column,
    resetClassificationComputedValues(
      getPrimitiveClassification(visualization, PrimitiveFilterType.POLYGON)
    ),
    {}
  );
  if (!classes.ok) return classes;
  const written = await commit(() => {
    visualizationStore.updateVisualization(visualization.id, {
      classification: resetClassificationComputedValues(
        visualization.classification
      ),
      polygon: {
        ...polygon,
        valueColumn: change.column,
        classification: resetClassificationComputedValues(
          polygon.classification
        )
      },
      mapping: { ...visualization.mapping, valueColumn: change.column }
    });
    visualizationStore.updateClassification(
      visualization.id,
      classes.value.update
    );
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
  });
  if (!written) return STALE_FAILURE;

  return {
    ok: true,
    data: {
      visualization_id: visualization.id,
      column: change.column,
      nature: nature ?? null,
      classification: classes.value.summary,
      legend_title_kept: listVisualizationLegends(visualization.id).some(
        (legend) => legend.titleMode === 'custom'
      )
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
  if (!projectStore.currentProject) return NO_PROJECT;
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
  // A file can carry instructions: an agent must not rewrite who made the
  // map or where its geometry comes from.
  if (
    item.role === ANNOTATION_ROLE.BASEMAP_SOURCE ||
    item.role === ANNOTATION_ROLE.CREDIT
  ) {
    return failure(
      'unsupported',
      'The basemap source and the credit are attribution texts: only the user edits them.'
    );
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

async function goToStep(step: ToolbarStep): Promise<AgentToolResult> {
  const project = projectStore.currentProject;
  if (!project) return NO_PROJECT;
  if (step !== ToolbarStep.Data && !project.data?.sourceFiles?.length) {
    return failure('unavailable', 'Import data before leaving the Data step.');
  }
  closeSelectedToolPanel();
  globalActions.setNavigationState(step);
  // The Styling step lays out the page texts the first time it opens.
  await tick();
  return { ok: true, data: { step, revision: readProjectSnapshot().revision } };
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
    required: ['visualization_id', 'expected_revision'],
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
    required: ['visualization_id', 'column', 'expected_revision'],
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
    required: ['expected_revision'],
    additionalProperties: false
  },
  annotations: {},
  execute: (input) => runEdit(input, parseLayoutTextsInput, applyLayoutTexts)
};

export const setTextTool: AgentTool = {
  name: 'set_text',
  title: 'Rewrite a text on the page',
  description:
    'Replace the content of one text on the map page, given its id from the texts list of inspect_project. Use it for a title or source written as a free text, which set_layout_texts reports as missing_on_page. Plain text, may span lines. The basemap source and the credit stay with the user.',
  inputSchema: {
    type: 'object',
    properties: {
      text_id: { type: 'string' },
      text: textProperty('New content of the text.', AGENT_TEXT_LIMITS.note),
      expected_revision: REVISION_PROPERTY
    },
    required: ['text_id', 'text', 'expected_revision'],
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
    required: ['legend_id', 'expected_revision'],
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
