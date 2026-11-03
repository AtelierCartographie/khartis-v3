import { inspectProjectTool } from './tools/read-tools';
import {
  applyVisualizationSuggestionTool,
  suggestVisualizationsTool
} from './tools/suggestion-tools';
import {
  goToStepTool,
  setLayoutTextsTool,
  setLegendTextsTool,
  setTextTool,
  updateClassificationTool
} from './tools/write-tools';
import { registerAgentTools } from './webmcp/adapter';

const AGENT_TOOLS = [
  inspectProjectTool,
  suggestVisualizationsTool,
  applyVisualizationSuggestionTool,
  updateClassificationTool,
  setLayoutTextsTool,
  setTextTool,
  setLegendTextsTool,
  goToStepTool
] as const;

/** Experimental: exposes the agent tools while the app runs. */
export function startAgentTools(): () => void {
  return registerAgentTools(AGENT_TOOLS);
}
