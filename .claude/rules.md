# Project Rules for Claude Code

## OpenAI Policy

**NEVER use any OpenAI products or services.** This includes:
- OpenAI API (GPT models, embeddings, etc.)
- OpenAI SDKs or libraries
- ChatGPT
- DALL-E
- Whisper API
- Any other OpenAI service

Use Gemini or Ollama for embeddings instead.

## Semantic Code Search

Use **lance-context** for semantic code search when exploring the codebase:
- Run `search_code` to find relevant code using natural language queries
- Run `index_codebase` if the index is out of date
- Prefer semantic search over manual file exploration for understanding code patterns

## Pre-Commit Review

Before committing changes, always review this rules file (`.claude/rules.md`) to ensure compliance with project standards.

## Branching Strategy

**NEVER commit directly to `main`.** All code changes must go through feature branches.

### Workflow

1. **Create a feature branch** before making any code changes:
   ```bash
   git checkout -b feature/descriptive-name
   ```

2. **Make focused, atomic commits** on the feature branch (see Git Commit Rules below)

3. **Push the feature branch** to remote:
   ```bash
   git push -u origin feature/descriptive-name
   ```

4. **Create a pull request** using GitHub CLI:
   ```bash
   gh pr create --title "Brief description" --body "## Summary\n- Change 1\n- Change 2"
   ```

5. **Wait for CI checks to pass** before merging:
   ```bash
   gh pr checks
   ```

6. **Merge to main** only after all checks pass:
   ```bash
   gh pr merge --squash
   ```

### Branch Naming

Use descriptive branch names with prefixes:
- `feature/` - New features (e.g., `feature/add-dashboard`)
- `fix/` - Bug fixes (e.g., `fix/search-timeout`)
- `refactor/` - Code refactoring (e.g., `refactor/embedding-backend`)
- `docs/` - Documentation changes (e.g., `docs/update-readme`)
- `test/` - Test additions/changes (e.g., `test/add-indexer-tests`)

### Before Merging Checklist

- [ ] All CI checks pass (`gh pr checks`)
- [ ] Code has been reviewed (if applicable)
- [ ] Branch is up to date with main (`git pull origin main --rebase`)
- [ ] No merge conflicts

## Git Commit Rules

1. **Maximum Subject Line Length**: 72 characters maximum for the commit subject line (first line)
2. **One Responsibility Per Commit**: Each commit MUST have exactly one responsibility. If multiple changes were made, create separate commits for each distinct change.
3. **Commit Body Format**: The commit body should ONLY contain "Co-Authored-By: Claude <noreply@anthropic.com>" and nothing else. No additional explanations or descriptions.
4. **No AI Attribution**: Do not mention "Generated with Claude Code" or similar AI attribution
5. **Imperative Mood**: Use imperative mood in subject line ("Add feature" not "Added feature" or "Adds feature")
6. **Atomic Commits**: Each commit should be independently deployable and make sense on its own

### Good Examples

```
Add ARIA labels to navigation component

Co-Authored-By: Claude <noreply@anthropic.com>
```

```
Implement message embeddings generation

Co-Authored-By: Claude <noreply@anthropic.com>
```

```
Fix async embedding in message creation

Co-Authored-By: Claude <noreply@anthropic.com>
```

### Bad Examples

```
Add accessibility features and update docs

Added ARIA labels, keyboard navigation, and documentation.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
```

(Bad because: Multiple responsibilities, extra text in body, AI attribution)

```
Implement embeddings, fix async generation, add tests

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
```

(Bad because: Multiple responsibilities in one commit)

## Remember

### Branching
- **NEVER commit directly to main** - always use feature branches
- Create a feature branch before making any code changes
- Ensure all CI checks pass before merging to main
- Use `gh pr create` and `gh pr merge` for the PR workflow

### Commits
- Each commit must have exactly ONE responsibility
- Keep commits focused and atomic
- Write clear, imperative commit messages ("Add feature" not "Added feature")
- Commit subject line must be under 72 characters
- Commit body should ONLY contain "Co-Authored-By: Claude <noreply@anthropic.com>"
- No additional text, descriptions, or explanations in commit body
- No AI attribution ("Generated with Claude Code" etc.)
- If you made multiple changes, create separate commits for each
