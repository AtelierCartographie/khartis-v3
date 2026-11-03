import { ANNOTATION_ROLE } from '$lib/features/commons/constants';
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
  legendActions
} from '$lib/features/step-toolbar';
import {
  buildClassificationUpdate,
  computeClassificationBreaks
} from '$lib/features/visualization-tab';
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
  parseUpdateClassificationInput,
  type ClassificationChange,
  type LayoutTextsChange,
  type LegendTextsChange,
  type TextChange
} from '../contract/validation';
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
          'quantiles: equal counts; equal_interval: equal ranges; kmeans: natural groups; q6: six quantile-based classes isolating extremes; nested_means: 2, 4 or 8 classes around means; head_tail: heavy-tailed distributions.'
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
