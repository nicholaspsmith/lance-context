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
description: Show glancey tool usage tips and quick reference
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
 * Template for .claude/commands/dashboard.md slash command
 */
const DASHBOARD_SLASH_COMMAND = `---
name: dashboard
description: Open the glancey dashboard in the browser
---

Open the glancey dashboard using the \`mcp__glancey__open_dashboard\` tool with \`force: true\` to bypass the cooldown.

The tool will return the actual URL where the dashboard is running (port may vary if 24300 is already in use by another instance).
`;

/**
 * Template for .claude/commands/init-project.md slash command
 */
const INIT_PROJECT_SLASH_COMMAND = `---
name: init-project
description: Set up glancey in this project
---

Run the \`init_project\` tool now to set up glancey in this project. This will:

1. Create or update **CLAUDE.md** with glancey usage instructions
2. Install a **post-commit hook** that warns when commits bypass the \`commit\` tool
3. Add **/glancey slash command** for quick reminders to use glancey tools
`;

/**
 * Template for .claude/commands/agents.md slash command
 * Note: This is a condensed version. The full prompt lives in .claude/commands/agents.md
 */
const AGENTS_SLASH_COMMAND = `---
name: agents
description: Launch parallel Claude Code agents on beads tasks in git worktrees
allowed-tools: Bash, Task, Read, Write, Glob, Grep, Edit, WebFetch, AskUserQuestion, ToolSearch
---

# /agents — Parallel Agent Orchestrator

You are the orchestrator. Launch 1-10 parallel Claude Code agents, each working autonomously on a beads task in its own git worktree.

**Arguments:** \\\`$ARGUMENTS\\\`

## Phases

1. **Parse & Fetch** — Parse flags (\\\`--auto-merge\\\`, \\\`--count N\\\`, \\\`--model MODEL\\\`, \\\`--budget N\\\`) and run \\\`bd ready --json\\\`
2. **Select** — Present numbered task list, user picks tasks
3. **Setup** — Create worktrees via glancey \\\`create_worktree\\\`, claim tasks via \\\`bd update {id} --claim\\\`
4. **Spawn** — Write agent prompt + MCP config to /tmp, launch \\\`claude -p\\\` per worktree
5. **Monitor** — Poll PIDs every 30s, tail logs, report status
6. **Report** — Summary table with PR links, suggest worktree cleanup

Each agent follows: Understand → Implement → Quality Gates → Commit → Self-Review → File Follow-ups → Push & PR → Monitor CI → Finalize.
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
 * Slash commands to install into .claude/commands/
 */
const SLASH_COMMANDS: { filename: string; content: string }[] = [
  { filename: 'glancey.md', content: GLANCEY_SLASH_COMMAND },
  { filename: 'dashboard.md', content: DASHBOARD_SLASH_COMMAND },
  { filename: 'init-project.md', content: INIT_PROJECT_SLASH_COMMAND },
  { filename: 'agents.md', content: AGENTS_SLASH_COMMAND },
];

/**
 * Install slash commands into .claude/commands/
 */
function installSlashCommands(projectPath: string): { installed: string[]; skipped: string[] } {
  const commandsDir = path.join(projectPath, '.claude', 'commands');
  const installed: string[] = [];
  const skipped: string[] = [];

  // Ensure .claude/commands/ directory exists
  if (!fs.existsSync(commandsDir)) {
    fs.mkdirSync(commandsDir, { recursive: true });
  }

  for (const cmd of SLASH_COMMANDS) {
    const cmdPath = path.join(commandsDir, cmd.filename);
    if (fs.existsSync(cmdPath)) {
      skipped.push(cmd.filename);
    } else {
      fs.writeFileSync(cmdPath, cmd.content);
      installed.push(cmd.filename);
    }
  }

  return { installed, skipped };
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

  // Install slash commands (/glancey, /dashboard, /init-project)
  try {
    const cmdResult = installSlashCommands(context.projectPath);
    result.skillInstalled = cmdResult.installed.length > 0;
    result.skillSkipped = cmdResult.skipped.length > 0 && cmdResult.installed.length === 0;

    if (cmdResult.installed.length > 0) {
      const names = cmdResult.installed.map((f) => `/${f.replace('.md', '')}`).join(', ');
      result.messages.push(`✓ Installed slash commands: ${names}`);
    }
    if (cmdResult.skipped.length > 0) {
      const names = cmdResult.skipped.map((f) => `/${f.replace('.md', '')}`).join(', ');
      result.messages.push(`• Already installed: ${names}`);
    }
  } catch (error) {
    result.messages.push(`✗ Failed to install slash commands: ${error}`);
  }

  // Build response
  const summary = result.messages.join('\n');
  const nextSteps: string[] = [];

  if (result.claudeMdCreated || result.claudeMdUpdated) {
    nextSteps.push('- Review and customize CLAUDE.md as needed');
    nextSteps.push('- Commit the CLAUDE.md changes');
  }

  if (result.skillInstalled) {
    nextSteps.push('- Commit .claude/commands/ so team members get the slash commands');
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
3. **Slash commands** - \`/glancey\` (usage tips), \`/dashboard\` (open UI), \`/init-project\` (setup)

Agents will now see glancey usage instructions when working in this project.`;

  return {
    content: [{ type: 'text', text: response }],
  };
}
