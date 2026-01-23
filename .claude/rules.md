# Project Rules for Claude Code

## OpenAI Policy

**NEVER use any OpenAI products or services.** This includes:
- OpenAI API (GPT models, embeddings, etc.)
- OpenAI SDKs or libraries
- ChatGPT
- DALL-E
- Whisper API
- Any other OpenAI service

Use Jina or Ollama for embeddings instead.

## Semantic Code Search

Use **lance-context** for semantic code search when exploring the codebase:
- Run `search_code` to find relevant code using natural language queries
- Run `index_codebase` if the index is out of date
- Prefer semantic search over manual file exploration for understanding code patterns

## Pre-Commit Review

Before committing changes, always review this rules file (`.claude/rules.md`) to ensure compliance with project standards.

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

- Each commit must have exactly ONE responsibility
- Keep commits focused and atomic
- Write clear, imperative commit messages ("Add feature" not "Added feature")
- Commit subject line must be under 72 characters
- Commit body should ONLY contain "Co-Authored-By: Claude <noreply@anthropic.com>"
- No additional text, descriptions, or explanations in commit body
- No AI attribution ("Generated with Claude Code" etc.)
- If you made multiple changes, create separate commits for each
