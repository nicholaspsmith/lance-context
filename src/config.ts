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
});

const EmbeddingConfigSchema = z.object({
  backend: z.enum(['jina', 'ollama']).optional(),
  model: z.string().optional(),
});

const ConfigSchema = z.object({
  patterns: z.array(z.string()).optional(),
  excludePatterns: z.array(z.string()).optional(),
  embedding: EmbeddingConfigSchema.optional(),
  chunking: ChunkingConfigSchema.optional(),
  search: SearchConfigSchema.optional(),
  instructions: z.string().optional(),
});

export type LanceContextConfig = z.infer<typeof ConfigSchema>;
export type ChunkingConfig = z.infer<typeof ChunkingConfigSchema>;
export type SearchConfig = z.infer<typeof SearchConfigSchema>;

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
};

export const DEFAULT_CONFIG: LanceContextConfig = {
  patterns: DEFAULT_PATTERNS,
  excludePatterns: DEFAULT_EXCLUDE_PATTERNS,
  chunking: DEFAULT_CHUNKING,
  search: DEFAULT_SEARCH,
};

const CONFIG_FILENAMES = ['.lance-context.json', 'lance-context.config.json'];

/**
 * Load and validate configuration from project directory
 */
export async function loadConfig(projectPath: string): Promise<LanceContextConfig> {
  for (const filename of CONFIG_FILENAMES) {
    const configPath = path.join(projectPath, filename);
    try {
      const content = await fs.readFile(configPath, 'utf-8');
      const rawConfig = JSON.parse(content);

      // Validate with Zod
      const result = ConfigSchema.safeParse(rawConfig);
      if (!result.success) {
        console.error(`[lance-context] Invalid config in ${filename}: ${result.error.message}`);
        continue;
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
        instructions: userConfig.instructions,
      };
    } catch {
      // Config file doesn't exist or is invalid JSON, continue to next
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
 * Get project instructions from config
 */
export function getInstructions(config: LanceContextConfig): string | undefined {
  return config.instructions;
}
