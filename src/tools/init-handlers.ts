/**
 * Handlers for project initialization tools.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { ToolResponse } from './types.js';

/**
 * Template for CLAUDE.md glancey section
 */
const GLANCEY_CLAUDE_MD_SECTION = `
## Glancey - Semantic Code Intelligence

This project uses **glancey** MCP for semantic code search and codebase understanding.

### Critical Rules

- **ALWAYS use \`commit\`** for git commits - never raw \`git commit\`
- **Use \`search_code\`** before grep/ripgrep when unsure of exact names
- **Use \`search_similar\`** before writing new code to check for existing patterns
- **Run \`summarize_codebase\`** at session start if unfamiliar with the project

### Tool Reference

#### Codebase Understanding
| Tool | When to Use |
|------|-------------|
| \`summarize_codebase\` | **First thing** when exploring a new codebase |
| \`list_concepts\` | Discover semantic groupings (auth, database, API, etc.) |
| \`search_by_concept\` | Deep-dive into a specific concept area |

#### Semantic Search
| Tool | When to Use |
|------|-------------|
| \`search_code\` | Find code by concept when unsure of exact names |
| \`search_similar\` | Find duplicate/related patterns for refactoring |

#### Symbol Analysis
| Tool | When to Use |
|------|-------------|
| \`get_symbols_overview\` | Understand a file's structure (classes, functions, etc.) |
| \`find_symbol\` | Find symbols by name pattern (supports globs) |
| \`find_referencing_symbols\` | Find all references to a symbol |
| \`search_for_pattern\` | Regex search across codebase |

#### Symbol Editing
| Tool | When to Use |
|------|-------------|
| \`replace_symbol_body\` | Rewrite a function/class/method |
| \`insert_before_symbol\` | Add code before a symbol |
| \`insert_after_symbol\` | Add code after a symbol |
| \`rename_symbol\` | Rename symbol and update all references |

#### Memory (Persistent Context)
| Tool | When to Use |
|------|-------------|
| \`write_memory\` | Save architectural decisions, patterns, context |
| \`read_memory\` | Retrieve saved context |
| \`list_memories\` | See available memory files |
| \`edit_memory\` | Update existing memory |
| \`delete_memory\` | Remove outdated memory |

#### Git Operations
| Tool | When to Use |
|------|-------------|
| \`commit\` | **ALWAYS** use instead of raw \`git commit\` |

#### Worktrees (Parallel Development)
| Tool | When to Use |
|------|-------------|
| \`create_worktree\` | Create isolated worktree for parallel work |
| \`list_worktrees\` | See active worktrees |
| \`worktree_status\` | Check a worktree's git state |
| \`remove_worktree\` | Clean up after parallel work |

#### Index Management
| Tool | When to Use |
|------|-------------|
| \`index_codebase\` | Re-index after major file changes |
| \`get_index_status\` | Check if reindexing is needed |
| \`clear_index\` | Clear and rebuild index |

### Signs You Should Use Glancey

- You used wildcards or regex to find something
- Multiple search attempts to find code
- Pattern-based search returned nothing
- Searching by concept, not exact identifier
- Exploring an unfamiliar codebase
- About to write code that might duplicate existing patterns
`;

/**
 * Template for .claude/commands/glancey.md slash command
 */
const GLANCEY_SLASH_COMMAND = `---
name: glancey
description: Remind yourself to use glancey's semantic code tools instead of grep/find/manual exploration
---

# Use Glancey

You have **glancey** MCP tools available. Stop and switch to them now.

## Instead of grep/ripgrep/find, use:

| Instead of... | Use this glancey tool |
|---|---|
| \`grep\`/\`rg\` for searching code | **\`search_code\`** - natural language semantic search |
| \`find\`/\`fd\`/\`glob\` for finding files | **\`search_code\`** or **\`find_symbol\`** |
| Reading many files to understand code | **\`summarize_codebase\`** + **\`list_concepts\`** |
| Searching for a function/class name | **\`find_symbol\`** (supports glob patterns) |
| Checking who calls a function | **\`find_referencing_symbols\`** |
| Regex search across files | **\`search_for_pattern\`** |
| Writing code that might already exist | **\`search_similar\`** first |
| Raw \`git commit\` | **\`commit\`** tool (validates branch, message format) |

## Quick reference

- **Explore unfamiliar code**: \`summarize_codebase\` → \`list_concepts\` → \`search_by_concept\`
- **Find code by concept**: \`search_code("how does auth work")\`
- **Find similar patterns**: \`search_similar(code="snippet")\` or \`search_similar(filepath="file.ts", startLine=10, endLine=25)\`
- **Understand a file**: \`get_symbols_overview(filepath="file.ts")\`
- **Edit symbols**: \`replace_symbol_body\`, \`insert_before_symbol\`, \`insert_after_symbol\`, \`rename_symbol\`
- **Save context for later**: \`write_memory\` / \`read_memory\`

## Check index health

If results seem stale, run \`get_index_status\` and \`index_codebase\` if needed.
`;

/**
 * Post-commit hook script content
 */
const POST_COMMIT_HOOK = `#!/usr/bin/env sh

# Glancey post-commit hook
# Warns when commits bypass the glancey commit tool

MARKER_FILE=".git/MCP_COMMIT_MARKER"

if [ -f "$MARKER_FILE" ]; then
  # Commit was made via MCP tool - clean up marker
  rm -f "$MARKER_FILE"
else
  # Commit bypassed MCP tool - warn the user
  echo ""
  echo "⚠️  WARNING: Commit made without using glancey commit tool"
  echo ""
  echo "Always use the MCP 'commit' tool instead of raw 'git commit'."
  echo "The commit tool validates:"
  echo "  - Feature branch (not main)"
  echo "  - Message format (≤72 chars, imperative mood)"
  echo "  - Single responsibility per commit"
  echo ""
  echo "Example: mcp__glancey__commit(message: \\"feat: add feature\\")"
  echo ""
fi
`;

/**
 * Context for init tools.
 */
export interface InitToolContext {
  projectPath: string;
}

/**
 * Result of initialization
 */
interface InitResult {
  claudeMdUpdated: boolean;
  claudeMdCreated: boolean;
  hookInstalled: boolean;
  hookSkipped: boolean;
  hookSkipReason?: string;
  skillInstalled: boolean;
  skillSkipped: boolean;
  messages: string[];
}

/**
 * Check if a file contains a glancey section
 */
function hasGlanceySection(content: string): boolean {
  return (
    content.includes('## Glancey') ||
    content.includes('mcp__glancey__commit') ||
    content.includes('glancey MCP')
  );
}

/**
 * Update or create CLAUDE.md with glancey instructions
 */
function updateClaudeMd(projectPath: string): { created: boolean; updated: boolean } {
  const claudeMdPath = path.join(projectPath, 'CLAUDE.md');

  if (fs.existsSync(claudeMdPath)) {
    const content = fs.readFileSync(claudeMdPath, 'utf-8');

    // Check if glancey section already exists
    if (hasGlanceySection(content)) {
      return { created: false, updated: false };
    }

    // Append glancey section
    const updatedContent = content.trimEnd() + '\n' + GLANCEY_CLAUDE_MD_SECTION;
    fs.writeFileSync(claudeMdPath, updatedContent);
    return { created: false, updated: true };
  } else {
    // Create new CLAUDE.md
    const newContent = `# Project Instructions
${GLANCEY_CLAUDE_MD_SECTION}`;
    fs.writeFileSync(claudeMdPath, newContent);
    return { created: true, updated: false };
  }
}

/**
 * Detect if project uses husky
 */
function usesHusky(projectPath: string): boolean {
  const huskyDir = path.join(projectPath, '.husky');
  return fs.existsSync(huskyDir) && fs.statSync(huskyDir).isDirectory();
}

/**
 * Install post-commit hook
 */
function installPostCommitHook(projectPath: string): {
  installed: boolean;
  skipped: boolean;
  reason?: string;
} {
  const gitDir = path.join(projectPath, '.git');

  // Check if this is a git repo
  if (!fs.existsSync(gitDir)) {
    return { installed: false, skipped: true, reason: 'Not a git repository' };
  }

  // Determine hook location
  let hookPath: string;
  if (usesHusky(projectPath)) {
    hookPath = path.join(projectPath, '.husky', 'post-commit');
  } else {
    const hooksDir = path.join(gitDir, 'hooks');
    if (!fs.existsSync(hooksDir)) {
      fs.mkdirSync(hooksDir, { recursive: true });
    }
    hookPath = path.join(hooksDir, 'post-commit');
  }

  // Check if hook already exists
  if (fs.existsSync(hookPath)) {
    const existingContent = fs.readFileSync(hookPath, 'utf-8');

    // Check if it already has glancey content
    if (existingContent.includes('MCP_COMMIT_MARKER') || existingContent.includes('glancey')) {
      return { installed: false, skipped: true, reason: 'Hook already contains glancey check' };
    }

    // Append to existing hook (without shebang)
    const hookBody = POST_COMMIT_HOOK.split('\n').slice(1).join('\n');
    const updatedContent = existingContent.trimEnd() + '\n\n# Glancey commit check\n' + hookBody;
    fs.writeFileSync(hookPath, updatedContent);
    fs.chmodSync(hookPath, '755');
    return { installed: true, skipped: false };
  }

  // Create new hook
  fs.writeFileSync(hookPath, POST_COMMIT_HOOK);
  fs.chmodSync(hookPath, '755');
  return { installed: true, skipped: false };
}

/**
 * Install the /glancey slash command into .claude/commands/
 */
function installSlashCommand(projectPath: string): { installed: boolean; skipped: boolean } {
  const commandsDir = path.join(projectPath, '.claude', 'commands');
  const skillPath = path.join(commandsDir, 'glancey.md');

  // Check if it already exists
  if (fs.existsSync(skillPath)) {
    return { installed: false, skipped: true };
  }

  // Ensure .claude/commands/ directory exists
  if (!fs.existsSync(commandsDir)) {
    fs.mkdirSync(commandsDir, { recursive: true });
  }

  fs.writeFileSync(skillPath, GLANCEY_SLASH_COMMAND);
  return { installed: true, skipped: false };
}

/**
 * Handle init_project tool.
 */
export async function handleInitProject(context: InitToolContext): Promise<ToolResponse> {
  const result: InitResult = {
    claudeMdUpdated: false,
    claudeMdCreated: false,
    hookInstalled: false,
    hookSkipped: false,
    skillInstalled: false,
    skillSkipped: false,
    messages: [],
  };

  // Update CLAUDE.md
  try {
    const claudeResult = updateClaudeMd(context.projectPath);
    result.claudeMdCreated = claudeResult.created;
    result.claudeMdUpdated = claudeResult.updated;

    if (claudeResult.created) {
      result.messages.push('✓ Created CLAUDE.md with glancey instructions');
    } else if (claudeResult.updated) {
      result.messages.push('✓ Added glancey section to existing CLAUDE.md');
    } else {
      result.messages.push('• CLAUDE.md already contains glancey instructions');
    }
  } catch (error) {
    result.messages.push(`✗ Failed to update CLAUDE.md: ${error}`);
  }

  // Install post-commit hook
  try {
    const hookResult = installPostCommitHook(context.projectPath);
    result.hookInstalled = hookResult.installed;
    result.hookSkipped = hookResult.skipped;
    result.hookSkipReason = hookResult.reason;

    if (hookResult.installed) {
      const location = usesHusky(context.projectPath)
        ? '.husky/post-commit'
        : '.git/hooks/post-commit';
      result.messages.push(`✓ Installed post-commit hook at ${location}`);
    } else if (hookResult.skipped) {
      result.messages.push(`• Skipped hook installation: ${hookResult.reason}`);
    }
  } catch (error) {
    result.messages.push(`✗ Failed to install hook: ${error}`);
  }

  // Install /glancey slash command
  try {
    const skillResult = installSlashCommand(context.projectPath);
    result.skillInstalled = skillResult.installed;
    result.skillSkipped = skillResult.skipped;

    if (skillResult.installed) {
      result.messages.push('✓ Installed /glancey slash command at .claude/commands/glancey.md');
    } else if (skillResult.skipped) {
      result.messages.push('• /glancey slash command already installed');
    }
  } catch (error) {
    result.messages.push(`✗ Failed to install slash command: ${error}`);
  }

  // Build response
  const summary = result.messages.join('\n');
  const nextSteps: string[] = [];

  if (result.claudeMdCreated || result.claudeMdUpdated) {
    nextSteps.push('- Review and customize CLAUDE.md as needed');
    nextSteps.push('- Commit the CLAUDE.md changes');
  }

  if (result.skillInstalled) {
    nextSteps.push('- Commit .claude/commands/glancey.md so team members get the /glancey command');
  }

  if (result.hookInstalled && !usesHusky(context.projectPath)) {
    nextSteps.push(
      '- Note: .git/hooks are not tracked by git - team members need to run init_project too'
    );
  }

  const response = `# Glancey Project Initialization

${summary}

${nextSteps.length > 0 ? '## Next Steps\n\n' + nextSteps.join('\n') : ''}

## What was configured

1. **CLAUDE.md** - Added comprehensive instructions for agents to use glancey tools
2. **Post-commit hook** - Warns when commits bypass the glancey commit tool
3. **/glancey command** - Type \`/glancey\` anytime to remind the agent to use glancey tools

Agents will now see glancey usage instructions when working in this project.`;

  return {
    content: [{ type: 'text', text: response }],
  };
}
