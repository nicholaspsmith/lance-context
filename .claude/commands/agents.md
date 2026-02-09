---
name: agents
description: Launch parallel Claude Code agents, each working autonomously on tasks in their own git worktrees
allowed-tools: Bash, Task, Read, Write, Glob, Grep, Edit, WebFetch, AskUserQuestion, ToolSearch
---

# /agents — Parallel Agent Orchestrator

You are the orchestrator. You will launch 1-10 parallel Claude Code agents, each working autonomously on a beads task in its own git worktree. Follow these phases exactly.

**Arguments:** `$ARGUMENTS`

---

## Phase 1 — Parse Arguments & Fetch Tasks

Parse the following flags from `$ARGUMENTS` (all optional):

| Flag | Default | Description |
|------|---------|-------------|
| `--auto-merge` | off | Agents auto-merge PRs after CI passes |
| `--count N` | (interactive) | Max number of tasks to select |
| `--model MODEL` | `sonnet` | Model for spawned agents (ignored when `--agent` is set, since the agent definition specifies its own model) |
| `--budget N` | `5` | Max USD per agent |
| `--agent NAME` | (none) | Use an existing agent definition from `.claude/agents/NAME.md`. Multiple instances of the same agent run concurrently — the file is a reusable template, not a per-instance resource. |

### Fetch tasks

First, check if `bd` (beads) is available:

```bash
command -v bd
```

**If `bd` is available**, fetch tasks:

```bash
bd ready --json
```

Then continue to Phase 2 with the beads task list.

**If `bd` is NOT available** (or returns no tasks), offer a manual task mode. Ask the user to describe the tasks they want agents to work on. Accept a list of task descriptions, one per agent. For example:

```
No beads tasks found. You can specify tasks manually.

How many agents do you want to launch? Enter task descriptions (one per line, empty line to finish):

  1. Fix the login page redirect bug
  2. Add unit tests for the payment module
  3. Refactor the database connection pool

```

For manual tasks, generate synthetic task IDs (e.g., `TASK-1`, `TASK-2`, etc.) and use the descriptions as both the title and description in later phases.

---

## Phase 2 — Select Tasks

**If using beads tasks**, present them as a numbered list:

```
Available tasks:
  1. [BD-123] Fix auth token refresh logic
  2. [BD-456] Add pagination to /api/users
  3. [BD-789] Update error messages for form validation
  ...
```

Ask the user to pick tasks. Accept:
- Individual numbers: `1 3 5`
- Ranges: `1-5`
- `all` (capped at `--count` if provided, otherwise 10)

**If using manual tasks**, the user already specified them in Phase 1 — skip straight to confirmation.

Confirm the selection before proceeding:

```
Will launch 3 agents:
  1. [BD-123] Fix auth token refresh logic
  2. [BD-456] Add pagination to /api/users
  3. [BD-789] Update error messages for form validation

Agent: parallel-task-worker | Model: sonnet | Budget: $5/agent | Auto-merge: off

Proceed? (y/n)
```

---

## Phase 3 — Setup Worktrees

For each selected task:

1. **Create worktree** using the glancey `create_worktree` MCP tool:
   - `short_name`: sanitized short name from task title (lowercase, hyphens, max 30 chars)
   - `issue_id`: the task ID (e.g., `BD-123` for beads, or `TASK-1` for manual tasks)

2. **Claim the task** (beads tasks only — skip for manual tasks):
   ```bash
   bd update {task_id} --claim
   ```

3. Record the worktree path returned by `create_worktree` for Phase 4.

---

## Phase 4 — Spawn Agents

**CRITICAL: NEVER create files in `.claude/agents/`.** Agent definitions are reusable templates — the same definition supports multiple concurrent instances. If `--agent` is specified, the file MUST already exist. If it doesn't, tell the user and stop.

For each worktree, do the following:

### 4a. Write task-specific prompt to temp file

Write the task-specific prompt (see Agent Prompt Template below) to `/tmp/agent-prompt-{task_id}.txt`. This avoids shell argument length limits.

### 4b. Build MCP config

Create an inline MCP config JSON that points glancey at the worktree. Write it to `/tmp/agent-mcp-{task_id}.json`:

```json
{
  "mcpServers": {
    "glancey": {
      "command": "npx",
      "args": ["-y", "glancey@latest"],
      "env": {
        "GLANCEY_PROJECT": "{worktree_path}"
      }
    }
  }
}
```

### 4c. Launch the agent

**If `--agent NAME` was provided** — use the existing agent definition. Each launch creates a new *instance* of the same agent; the `.claude/agents/NAME.md` file is a shared template:

```bash
claude --agent {agent_name} \
  --permission-mode bypassPermissions \
  --max-budget-usd {budget} \
  --mcp-config /tmp/agent-mcp-{task_id}.json \
  -p "$(cat /tmp/agent-prompt-{task_id}.txt)" \
  > /tmp/agent-{task_id}.log 2>&1 &
```

Note: `--model` is omitted because the agent definition specifies its own model. `--max-budget-usd` still applies as a per-instance cap.

**If no `--agent` flag** — use inline prompt mode:

```bash
cat /tmp/agent-prompt-{task_id}.txt | claude -p \
  --permission-mode bypassPermissions \
  --model {model} \
  --max-budget-usd {budget} \
  --mcp-config /tmp/agent-mcp-{task_id}.json \
  > /tmp/agent-{task_id}.log 2>&1 &
```

Store the PID (`$!`) for monitoring.

### 4d. Report launch

After all agents are spawned, print a summary:

```
Launched 3 agents:
  PID 12345 → [BD-123] Fix auth token refresh (worktree: /path/to/worktree)
  PID 12346 → [BD-456] Add pagination (worktree: /path/to/worktree)
  PID 12347 → [BD-789] Update error messages (worktree: /path/to/worktree)

Logs: /tmp/agent-{task_id}.log
```

---

## Phase 5 — Monitor

Poll every 30 seconds:

```bash
# Check if each PID is still running
kill -0 {pid} 2>/dev/null && echo "running" || echo "done"
```

For each completed agent, tail the last 20 lines of its log:

```bash
tail -20 /tmp/agent-{task_id}.log
```

Print status updates as agents complete. Continue until all agents are done or the user interrupts.

---

## Phase 6 — Report

When all agents are finished, produce a summary table:

```
Agent Results:
┌──────────┬───────────────────────────────────┬────────┬──────────────────────────────────┐
│ Task     │ Title                             │ Status │ PR                               │
├──────────┼───────────────────────────────────┼────────┼──────────────────────────────────┤
│ BD-123   │ Fix auth token refresh            │ ✓ PR   │ https://github.com/.../pull/42   │
│ BD-456   │ Add pagination                    │ ✓ PR   │ https://github.com/.../pull/43   │
│ BD-789   │ Update error messages             │ ✗ Fail │ See /tmp/agent-BD-789.log        │
└──────────┴───────────────────────────────────┴────────┴──────────────────────────────────┘
```

Suggest worktree cleanup:
```
To clean up worktrees, use the glancey `remove_worktree` tool for each completed task,
or run: git worktree list | grep agents/
```

---

## Agent Prompt Template

Each spawned agent receives the following prompt (written to `/tmp/agent-prompt-{task_id}.txt`). Fill in the placeholders before writing.

```
You are an autonomous coding agent. Complete the task below by following the 9-step workflow exactly.

## Task Details

- **Task ID**: {task_id}
- **Title**: {task_title}
- **Description**: {task_description}
- **Repository**: {repo_name}
- **Branch**: {branch_name}
- **Worktree**: {worktree_path}
- **Auto-merge**: {auto_merge}

## Mandatory Workflow

### Step 1 — Understand
- Read the task description carefully
- Use glancey `search_code` to find relevant code
- Use `summarize_codebase` if needed for context
- Identify all files that need changes

### Step 2 — Implement
- Make the necessary code changes
- Write or update tests for your changes
- Keep changes focused on the task — do not refactor unrelated code

### Step 3 — Quality Gates
- Run the project's test suite (look for `npm test`, `pytest`, `cargo test`, etc.)
- Run any linters/formatters the project uses
- Fix any failures before proceeding

### Step 4 — Commit
- Use the glancey `commit` MCP tool (NEVER raw `git commit`)
- Write a clear, imperative commit message under 72 chars
- One responsibility per commit — split if needed

### Step 5 — Self-Review
- Run `git diff main...HEAD` to review all your changes
- Look for:
  - Missed edge cases
  - Missing error handling
  - Leftover debug code
  - Security issues (injection, XSS, etc.)
- Fix any issues found, then commit the fixes

### Step 6 — File Follow-ups
- If you discover issues outside the scope of this task, create beads tasks:
  ```bash
  bd create --title "Follow-up: {description}" --priority medium
  ```
- Do NOT try to fix unrelated issues in this PR

### Step 7 — Push & Create PR
- Push the branch:
  ```bash
  git push -u origin {branch_name}
  ```
- Create a PR:
  ```bash
  gh pr create --title "{task_id}: {short_title}" --body "## Summary

  {one_paragraph_summary}

  ## Task
  Resolves {task_id}

  ## Changes
  {bullet_list_of_changes}

  ## Testing
  {what_was_tested}"
  ```

### Step 8 — Monitor CI
- Watch CI checks:
  ```bash
  gh pr checks --watch --interval 5
  ```
- If checks fail:
  1. Read the failure logs
  2. Fix the issue
  3. Commit and push
  4. Watch again
- Maximum 3 fix cycles. If still failing after 3, stop and note the failure.

### Step 9 — Finalize
- If `--auto-merge` is enabled AND all CI checks pass:
  ```bash
  git fetch origin main && git rebase origin/main && git push --force-with-lease
  gh pr merge --squash --auto
  ```
- Close the beads task (skip for manual tasks):
  ```bash
  bd update {task_id} --status done
  ```
- If NOT auto-merging, just mark the task as ready for review (skip for manual tasks):
  ```bash
  bd update {task_id} --status review
  ```

## Rules
- Stay in your worktree — never modify the main worktree
- Use glancey MCP tools for search and commits
- Do not use OpenAI APIs or services
- Keep commits atomic and focused
- If stuck for more than 5 minutes on a single issue, file a follow-up task and move on
```

---

## Error Handling

- If `bd` command not found → fall back to manual task mode (see Phase 1)
- If `create_worktree` fails → skip that task, continue with others
- If `claude -p` is not available → tell user to install Claude Code CLI
- If an agent PID dies unexpectedly → check its log, report the error
- If user presses Ctrl+C → kill all agent PIDs, report partial results
