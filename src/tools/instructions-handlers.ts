/**
 * Tool handlers for project instructions.
 */

import { loadConfig, getInstructions } from '../config.js';
import type { ToolResponse } from './types.js';

/**
 * Interface for config loader (for testability).
 */
export interface IConfigLoader {
  loadConfig(projectPath: string): Promise<Record<string, unknown>>;
  getInstructions(config: Record<string, unknown>): string | undefined;
}

/**
 * Context for instructions tools.
 */
export interface InstructionsToolContext {
  projectPath: string;
  priorityInstructions: string;
  /** Optional config loader (for testing). */
  configLoader?: IConfigLoader;
}

/**
 * Default config loader using actual config module.
 */
const defaultConfigLoader: IConfigLoader = {
  loadConfig,
  getInstructions,
};

/**
 * Get or use default config loader.
 */
function getConfigLoader(context: InstructionsToolContext): IConfigLoader {
  return context.configLoader ?? defaultConfigLoader;
}

/**
 * Handle get_project_instructions tool.
 */
export async function handleGetProjectInstructions(
  context: InstructionsToolContext
): Promise<ToolResponse> {
  const loader = getConfigLoader(context);
  const config = await loader.loadConfig(context.projectPath);
  const projectInstructions = loader.getInstructions(config);
  const fullInstructions = context.priorityInstructions + (projectInstructions || '');

  return {
    content: [
      {
        type: 'text',
        text:
          fullInstructions ||
          'No project instructions configured. Add an "instructions" field to .lance-context.json.',
      },
    ],
  };
}
