import * as fs from 'fs/promises';
import * as path from 'path';
import { z } from 'zod';

/**
 * Zod schema for configuration validation
 */
const ChunkingConfigSchema = z.object({
  maxLines: z.number().min(10).max(500).optional(),
  overlap: z.number().min(0).max(50).optional(),
});

const SearchConfigSchema = z.object({
  semanticWeight: z.number().min(0).max(1).optional(),
  keywordWeight: z.number().min(0).max(1).optional(),
  /** Automatically reindex when stale files are detected before search (default: true) */
  autoReindex: z.boolean().optional(),
});

const EmbeddingConfigSchema = z.object({
  backend: z.enum(['jina', 'ollama']).optional(),
  model: z.string().optional(),
  /** Number of concurrent requests to Ollama (default: 10). Increase if your system has capacity. */
  ollamaConcurrency: z.number().min(1).max(200).optional(),
});

const DashboardConfigSchema = z.object({
  enabled: z.boolean().optional(),
  port: z.number().min(1024).max(65535).optional(),
  openBrowser: z.boolean().optional(),
});

const IndexingConfigSchema = z.object({
  /** Delay in milliseconds between embedding batches (default: 0) */
  batchDelayMs: z.number().min(0).max(10000).optional(),
  /** Number of chunks to embed per batch (default: 32). Higher values reduce overhead but use more memory. */
  batchSize: z.number().min(1).max(1000).optional(),
});

const ConfigSchema = z.object({
  patterns: z.array(z.string()).optional(),
  excludePatterns: z.array(z.string()).optional(),
  embedding: EmbeddingConfigSchema.optional(),
  chunking: ChunkingConfigSchema.optional(),
  search: SearchConfigSchema.optional(),
  dashboard: DashboardConfigSchema.optional(),
  indexing: IndexingConfigSchema.optional(),
  instructions: z.string().optional(),
});

export type LanceContextConfig = z.infer<typeof ConfigSchema>;
export type ChunkingConfig = z.infer<typeof ChunkingConfigSchema>;
export type SearchConfig = z.infer<typeof SearchConfigSchema>;
export type DashboardConfig = z.infer<typeof DashboardConfigSchema>;
export type IndexingConfig = z.infer<typeof IndexingConfigSchema>;

const DEFAULT_PATTERNS = [
  '**/*.ts',
  '**/*.tsx',
  '**/*.js',
  '**/*.jsx',
  '**/*.py',
  '**/*.go',
  '**/*.rs',
  '**/*.java',
  '**/*.rb',
  '**/*.php',
  '**/*.c',
  '**/*.cpp',
  '**/*.h',
  '**/*.hpp',
  '**/*.cs',
  '**/*.swift',
  '**/*.kt',
];

const DEFAULT_EXCLUDE_PATTERNS = [
  '**/node_modules/**',
  '**/dist/**',
  '**/.git/**',
  '**/build/**',
  '**/target/**',
  '**/__pycache__/**',
  '**/venv/**',
  '**/.venv/**',
  '**/vendor/**',
  '**/*.min.js',
  '**/*.min.css',
];

/**
 * Default chunking configuration
 */
export const DEFAULT_CHUNKING: Required<ChunkingConfig> = {
  maxLines: 100,
  overlap: 20,
};

/**
 * Default search configuration
 */
export const DEFAULT_SEARCH: Required<SearchConfig> = {
  semanticWeight: 0.7,
  keywordWeight: 0.3,
  autoReindex: true,
};

/**
 * Default dashboard configuration
 */
export const DEFAULT_DASHBOARD: Required<DashboardConfig> = {
  enabled: true,
  port: 24300,
  openBrowser: true,
};

/**
 * Default indexing configuration
 */
export const DEFAULT_INDEXING: Required<IndexingConfig> = {
  batchDelayMs: 0,
  batchSize: 200,
};

export const DEFAULT_CONFIG: LanceContextConfig = {
  patterns: DEFAULT_PATTERNS,
  excludePatterns: DEFAULT_EXCLUDE_PATTERNS,
  chunking: DEFAULT_CHUNKING,
  search: DEFAULT_SEARCH,
  dashboard: DEFAULT_DASHBOARD,
  indexing: DEFAULT_INDEXING,
};

const CONFIG_FILENAMES = ['.lance-context.json', 'lance-context.config.json'];

/**
 * Load and validate configuration from project directory
 */

/**
 * Format a Zod validation error into a user-friendly message
 */
function formatValidationError(error: z.core.$ZodIssue, rawConfig: unknown): string {
  const pathArray = error.path.map((p) => String(p));
  const fieldPath = pathArray.join('.');
  const rawValue = getValueAtPath(rawConfig, pathArray);
  const rawValueStr = rawValue === undefined ? 'undefined' : JSON.stringify(rawValue);

  switch (error.code) {
    case 'invalid_type': {
      const expected = (error as z.core.$ZodIssueInvalidType).expected;
      const suggestion = getSuggestionForType(fieldPath, String(expected), rawValue);
      return `  - ${fieldPath}: Expected ${expected}, got ${typeof rawValue} ${rawValueStr}${suggestion}`;
    }
    case 'too_small': {
      const issueMin = error as z.core.$ZodIssueTooSmall;
      const suggestion = getSuggestionForRange(fieldPath, 'minimum', issueMin.minimum as number);
      return `  - ${fieldPath}: Value ${rawValueStr} is below minimum ${issueMin.minimum}${suggestion}`;
    }
    case 'too_big': {
      const issueMax = error as z.core.$ZodIssueTooBig;
      const suggestion = getSuggestionForRange(fieldPath, 'maximum', issueMax.maximum as number);
      return `  - ${fieldPath}: Value ${rawValueStr} exceeds maximum ${issueMax.maximum}${suggestion}`;
    }
    case 'invalid_value': {
      // Handle enum validation errors
      const issueVal = error as z.core.$ZodIssueInvalidValue;
      if (issueVal.values) {
        const options = issueVal.values.map((o) => `'${String(o)}'`).join(', ');
        return `  - ${fieldPath}: Invalid value ${rawValueStr}. Valid options: ${options}`;
      }
      return `  - ${fieldPath}: Invalid value ${rawValueStr}`;
    }
    default:
      return `  - ${fieldPath}: ${error.message}`;
  }
}

/**
 * Get the value at a path in an object
 */
function getValueAtPath(obj: unknown, pathSegments: string[]): unknown {
  let current: unknown = obj;
  for (const segment of pathSegments) {
    if (current === null || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

/**
 * Get suggestions for common type mistakes
 */
function getSuggestionForType(fieldPath: string, expected: string, rawValue: unknown): string {
  // Check for string that looks like a number
  if (expected === 'number' && typeof rawValue === 'string') {
    const num = Number(rawValue);
    if (!isNaN(num)) {
      return `\n    Suggestion: Remove quotes to use numeric value: ${num}`;
    }
  }

  // Check for string that looks like a boolean
  if (expected === 'boolean' && typeof rawValue === 'string') {
    const lower = rawValue.toLowerCase();
    if (lower === 'true' || lower === 'false') {
      return `\n    Suggestion: Remove quotes to use boolean value: ${lower}`;
    }
  }

  // Check for array expected but got single value
  if (expected === 'array' && typeof rawValue === 'string') {
    return `\n    Suggestion: Wrap the value in an array: ["${rawValue}"]`;
  }

  return '';
}

/**
 * Get suggestions for range violations
 */
function getSuggestionForRange(
  fieldPath: string,
  boundType: 'minimum' | 'maximum',
  _bound: number
): string {
  const fieldSuggestions: Record<string, string> = {
    'chunking.maxLines':
      boundType === 'minimum'
        ? '\n    Suggestion: Use a value between 10 and 500 lines per chunk'
        : '\n    Suggestion: Use a value between 10 and 500 lines per chunk',
    'chunking.overlap':
      boundType === 'minimum'
        ? '\n    Suggestion: Use a value between 0 and 50 lines for overlap'
        : '\n    Suggestion: Use a value between 0 and 50 lines for overlap',
    'search.semanticWeight': '\n    Suggestion: Use a value between 0.0 and 1.0 for search weights',
    'search.keywordWeight': '\n    Suggestion: Use a value between 0.0 and 1.0 for search weights',
    'dashboard.port': '\n    Suggestion: Use a port number between 1024 and 65535',
  };

  return fieldSuggestions[fieldPath] || '';
}

/**
 * Print formatted validation warnings to console
 */
function printValidationWarnings(filename: string, errors: z.ZodIssue[], rawConfig: unknown): void {
  console.warn(`[lance-context] Warning: Invalid config in ${filename}`);
  for (const error of errors) {
    console.warn(formatValidationError(error, rawConfig));
  }
  console.warn('  Using default values for invalid fields.');
}

/**
 * Extract valid configuration values from a raw config object.
 * This allows us to use valid fields while falling back to defaults for invalid ones.
 */
function extractValidConfig(rawConfig: unknown): Partial<z.infer<typeof ConfigSchema>> {
  if (typeof rawConfig !== 'object' || rawConfig === null) {
    return {};
  }

  const config = rawConfig as Record<string, unknown>;
  const result: Partial<z.infer<typeof ConfigSchema>> = {};

  // Try to parse each section independently
  if (config.patterns !== undefined) {
    const patternsResult = z.array(z.string()).safeParse(config.patterns);
    if (patternsResult.success) {
      result.patterns = patternsResult.data;
    }
  }

  if (config.excludePatterns !== undefined) {
    const excludeResult = z.array(z.string()).safeParse(config.excludePatterns);
    if (excludeResult.success) {
      result.excludePatterns = excludeResult.data;
    }
  }

  if (config.instructions !== undefined) {
    const instructionsResult = z.string().safeParse(config.instructions);
    if (instructionsResult.success) {
      result.instructions = instructionsResult.data;
    }
  }

  if (config.embedding !== undefined) {
    const embeddingResult = EmbeddingConfigSchema.safeParse(config.embedding);
    if (embeddingResult.success) {
      result.embedding = embeddingResult.data;
    }
  }

  if (config.chunking !== undefined) {
    // Try to extract valid individual fields from chunking
    const chunkingResult = extractValidChunking(config.chunking);
    if (Object.keys(chunkingResult).length > 0) {
      result.chunking = chunkingResult;
    }
  }

  if (config.search !== undefined) {
    // Try to extract valid individual fields from search
    const searchResult = extractValidSearch(config.search);
    if (Object.keys(searchResult).length > 0) {
      result.search = searchResult;
    }
  }

  if (config.dashboard !== undefined) {
    // Try to extract valid individual fields from dashboard
    const dashboardResult = extractValidDashboard(config.dashboard);
    if (Object.keys(dashboardResult).length > 0) {
      result.dashboard = dashboardResult;
    }
  }

  if (config.indexing !== undefined) {
    // Try to extract valid individual fields from indexing
    const indexingResult = extractValidIndexing(config.indexing);
    if (Object.keys(indexingResult).length > 0) {
      result.indexing = indexingResult;
    }
  }

  return result;
}

/**
 * Extract valid chunking config fields
 */
function extractValidChunking(rawChunking: unknown): Partial<z.infer<typeof ChunkingConfigSchema>> {
  if (typeof rawChunking !== 'object' || rawChunking === null) {
    return {};
  }

  const chunking = rawChunking as Record<string, unknown>;
  const result: Partial<z.infer<typeof ChunkingConfigSchema>> = {};

  if (chunking.maxLines !== undefined) {
    const maxLinesResult = z.number().min(10).max(500).safeParse(chunking.maxLines);
    if (maxLinesResult.success) {
      result.maxLines = maxLinesResult.data;
    }
  }

  if (chunking.overlap !== undefined) {
    const overlapResult = z.number().min(0).max(50).safeParse(chunking.overlap);
    if (overlapResult.success) {
      result.overlap = overlapResult.data;
    }
  }

  return result;
}

/**
 * Extract valid search config fields
 */
function extractValidSearch(rawSearch: unknown): Partial<z.infer<typeof SearchConfigSchema>> {
  if (typeof rawSearch !== 'object' || rawSearch === null) {
    return {};
  }

  const search = rawSearch as Record<string, unknown>;
  const result: Partial<z.infer<typeof SearchConfigSchema>> = {};

  if (search.semanticWeight !== undefined) {
    const semanticResult = z.number().min(0).max(1).safeParse(search.semanticWeight);
    if (semanticResult.success) {
      result.semanticWeight = semanticResult.data;
    }
  }

  if (search.keywordWeight !== undefined) {
    const keywordResult = z.number().min(0).max(1).safeParse(search.keywordWeight);
    if (keywordResult.success) {
      result.keywordWeight = keywordResult.data;
    }
  }

  if (search.autoReindex !== undefined) {
    const autoReindexResult = z.boolean().safeParse(search.autoReindex);
    if (autoReindexResult.success) {
      result.autoReindex = autoReindexResult.data;
    }
  }

  return result;
}

/**
 * Extract valid dashboard config fields
 */
function extractValidDashboard(
  rawDashboard: unknown
): Partial<z.infer<typeof DashboardConfigSchema>> {
  if (typeof rawDashboard !== 'object' || rawDashboard === null) {
    return {};
  }

  const dashboard = rawDashboard as Record<string, unknown>;
  const result: Partial<z.infer<typeof DashboardConfigSchema>> = {};

  if (dashboard.enabled !== undefined) {
    const enabledResult = z.boolean().safeParse(dashboard.enabled);
    if (enabledResult.success) {
      result.enabled = enabledResult.data;
    }
  }

  if (dashboard.port !== undefined) {
    const portResult = z.number().min(1024).max(65535).safeParse(dashboard.port);
    if (portResult.success) {
      result.port = portResult.data;
    }
  }

  if (dashboard.openBrowser !== undefined) {
    const openBrowserResult = z.boolean().safeParse(dashboard.openBrowser);
    if (openBrowserResult.success) {
      result.openBrowser = openBrowserResult.data;
    }
  }

  return result;
}

/**
 * Extract valid indexing config fields
 */
function extractValidIndexing(rawIndexing: unknown): Partial<z.infer<typeof IndexingConfigSchema>> {
  if (typeof rawIndexing !== 'object' || rawIndexing === null) {
    return {};
  }

  const indexing = rawIndexing as Record<string, unknown>;
  const result: Partial<z.infer<typeof IndexingConfigSchema>> = {};

  if (indexing.batchDelayMs !== undefined) {
    const batchDelayResult = z.number().min(0).max(10000).safeParse(indexing.batchDelayMs);
    if (batchDelayResult.success) {
      result.batchDelayMs = batchDelayResult.data;
    }
  }

  if (indexing.batchSize !== undefined) {
    const batchSizeResult = z.number().min(1).max(100).safeParse(indexing.batchSize);
    if (batchSizeResult.success) {
      result.batchSize = batchSizeResult.data;
    }
  }

  return result;
}

export async function loadConfig(projectPath: string): Promise<LanceContextConfig> {
  for (const filename of CONFIG_FILENAMES) {
    const configPath = path.join(projectPath, filename);
    try {
      const content = await fs.readFile(configPath, 'utf-8');
      const rawConfig = JSON.parse(content);

      // Validate with Zod
      const result = ConfigSchema.safeParse(rawConfig);
      if (!result.success) {
        // Print detailed validation warnings
        printValidationWarnings(filename, result.error.issues, rawConfig);

        // Try to salvage valid parts of the config by validating each section separately
        const validConfig = extractValidConfig(rawConfig);

        return {
          patterns: validConfig.patterns || DEFAULT_PATTERNS,
          excludePatterns: validConfig.excludePatterns || DEFAULT_EXCLUDE_PATTERNS,
          embedding: validConfig.embedding,
          chunking: {
            ...DEFAULT_CHUNKING,
            ...validConfig.chunking,
          },
          search: {
            ...DEFAULT_SEARCH,
            ...validConfig.search,
          },
          dashboard: {
            ...DEFAULT_DASHBOARD,
            ...validConfig.dashboard,
          },
          indexing: {
            ...DEFAULT_INDEXING,
            ...validConfig.indexing,
          },
          instructions: validConfig.instructions,
        };
      }

      const userConfig = result.data;

      return {
        patterns: userConfig.patterns || DEFAULT_PATTERNS,
        excludePatterns: userConfig.excludePatterns || DEFAULT_EXCLUDE_PATTERNS,
        embedding: userConfig.embedding,
        chunking: {
          ...DEFAULT_CHUNKING,
          ...userConfig.chunking,
        },
        search: {
          ...DEFAULT_SEARCH,
          ...userConfig.search,
        },
        dashboard: {
          ...DEFAULT_DASHBOARD,
          ...userConfig.dashboard,
        },
        indexing: {
          ...DEFAULT_INDEXING,
          ...userConfig.indexing,
        },
        instructions: userConfig.instructions,
      };
    } catch (error) {
      // Check if it's a JSON parse error
      if (error instanceof SyntaxError) {
        console.warn(`[lance-context] Warning: Invalid JSON in ${filename}`);
        console.warn(`  - ${error.message}`);
        console.warn(
          '  Suggestion: Check for trailing commas, missing quotes, or other JSON syntax errors.'
        );
        continue;
      }
      // Config file doesn't exist, continue to next
    }
  }

  return DEFAULT_CONFIG;
}

/**
 * Get default file patterns
 */
export function getDefaultPatterns(): string[] {
  return [...DEFAULT_PATTERNS];
}

/**
 * Get default exclude patterns
 */
export function getDefaultExcludePatterns(): string[] {
  return [...DEFAULT_EXCLUDE_PATTERNS];
}

/**
 * Get chunking config with defaults
 */
export function getChunkingConfig(config: LanceContextConfig): Required<ChunkingConfig> {
  return {
    ...DEFAULT_CHUNKING,
    ...config.chunking,
  };
}

/**
 * Get search config with defaults
 */
export function getSearchConfig(config: LanceContextConfig): Required<SearchConfig> {
  return {
    ...DEFAULT_SEARCH,
    ...config.search,
  };
}

/**
 * Get dashboard config with defaults
 */
export function getDashboardConfig(config: LanceContextConfig): Required<DashboardConfig> {
  return {
    ...DEFAULT_DASHBOARD,
    ...config.dashboard,
  };
}

/**
 * Get indexing config with defaults
 */
export function getIndexingConfig(config: LanceContextConfig): Required<IndexingConfig> {
  return {
    ...DEFAULT_INDEXING,
    ...config.indexing,
  };
}

/**
 * Get project instructions from config
 */
export function getInstructions(config: LanceContextConfig): string | undefined {
  return config.instructions;
}

/**
 * Secrets stored separately from main config (should be gitignored)
 */
export interface LanceContextSecrets {
  jinaApiKey?: string;
}

/**
 * Load secrets from .lance-context/secrets.json
 */
export async function loadSecrets(projectPath: string): Promise<LanceContextSecrets> {
  const secretsPath = path.join(projectPath, '.lance-context', 'secrets.json');
  try {
    const content = await fs.readFile(secretsPath, 'utf-8');
    return JSON.parse(content) as LanceContextSecrets;
  } catch {
    return {};
  }
}

/**
 * Save secrets to .lance-context/secrets.json
 */
export async function saveSecrets(
  projectPath: string,
  secrets: LanceContextSecrets
): Promise<void> {
  const lanceDir = path.join(projectPath, '.lance-context');
  const secretsPath = path.join(lanceDir, 'secrets.json');

  // Ensure .lance-context directory exists
  await fs.mkdir(lanceDir, { recursive: true });

  // Load existing secrets and merge
  const existing = await loadSecrets(projectPath);
  const merged = { ...existing, ...secrets };

  await fs.writeFile(secretsPath, JSON.stringify(merged, null, 2));
}

/**
 * Embedding settings for dashboard configuration
 */
export interface EmbeddingSettings {
  backend: 'jina' | 'ollama';
  apiKey?: string;
  ollamaUrl?: string;
  /** Number of concurrent requests to Ollama */
  ollamaConcurrency?: number;
  /** Number of chunks per embedding batch */
  batchSize?: number;
}

/**
 * Save embedding settings from dashboard
 * - Stores backend preference in .lance-context.json
 * - Stores API key in .lance-context/secrets.json (gitignored)
 */
export async function saveEmbeddingSettings(
  projectPath: string,
  settings: EmbeddingSettings
): Promise<void> {
  // Load existing config
  const configPath = path.join(projectPath, '.lance-context.json');
  let existingConfig: LanceContextConfig = {};

  try {
    const content = await fs.readFile(configPath, 'utf-8');
    existingConfig = JSON.parse(content);
  } catch {
    // File doesn't exist, start fresh
  }

  // Update embedding config
  existingConfig.embedding = {
    ...existingConfig.embedding,
    backend: settings.backend,
  };

  // Update ollamaConcurrency if provided
  if (settings.ollamaConcurrency !== undefined) {
    existingConfig.embedding.ollamaConcurrency = settings.ollamaConcurrency;
  }

  // Update indexing batch size if provided
  if (settings.batchSize !== undefined) {
    existingConfig.indexing = {
      ...existingConfig.indexing,
      batchSize: settings.batchSize,
    };
  }

  // Save config
  await fs.writeFile(configPath, JSON.stringify(existingConfig, null, 2));

  // Save API key to secrets if provided
  if (settings.apiKey) {
    await saveSecrets(projectPath, { jinaApiKey: settings.apiKey });
  }
}

/**
 * Get current embedding settings including secrets
 */
export async function getEmbeddingSettings(projectPath: string): Promise<{
  backend: 'jina' | 'ollama';
  hasApiKey: boolean;
  ollamaUrl?: string;
  ollamaConcurrency: number;
  batchSize: number;
}> {
  const config = await loadConfig(projectPath);
  const secrets = await loadSecrets(projectPath);

  return {
    backend: config.embedding?.backend || 'jina',
    hasApiKey: !!(secrets.jinaApiKey || process.env.JINA_API_KEY),
    ollamaUrl: process.env.OLLAMA_URL || 'http://localhost:11434',
    ollamaConcurrency: config.embedding?.ollamaConcurrency || 1,
    batchSize: config.indexing?.batchSize || DEFAULT_INDEXING.batchSize,
  };
}

/**
 * Dashboard settings for dashboard configuration via UI
 */
export interface DashboardSettings {
  enabled: boolean;
  port?: number;
  openBrowser?: boolean;
}

/**
 * Save dashboard settings to .lance-context.json
 */
export async function saveDashboardSettings(
  projectPath: string,
  settings: DashboardSettings
): Promise<void> {
  const configPath = path.join(projectPath, '.lance-context.json');
  let existingConfig: LanceContextConfig = {};

  try {
    const content = await fs.readFile(configPath, 'utf-8');
    existingConfig = JSON.parse(content);
  } catch {
    // File doesn't exist, start fresh
  }

  // Update dashboard config
  existingConfig.dashboard = {
    ...existingConfig.dashboard,
    enabled: settings.enabled,
  };

  // Only update port if provided
  if (settings.port !== undefined) {
    existingConfig.dashboard.port = settings.port;
  }

  // Only update openBrowser if provided
  if (settings.openBrowser !== undefined) {
    existingConfig.dashboard.openBrowser = settings.openBrowser;
  }

  await fs.writeFile(configPath, JSON.stringify(existingConfig, null, 2));
}

/**
 * Get current dashboard settings
 */
export async function getDashboardSettings(projectPath: string): Promise<{
  enabled: boolean;
  port: number;
  openBrowser: boolean;
}> {
  const config = await loadConfig(projectPath);

  return {
    enabled: config.dashboard?.enabled ?? DEFAULT_DASHBOARD.enabled,
    port: config.dashboard?.port ?? DEFAULT_DASHBOARD.port,
    openBrowser: config.dashboard?.openBrowser ?? DEFAULT_DASHBOARD.openBrowser,
  };
}
