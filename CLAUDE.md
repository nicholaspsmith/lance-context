# Claude Code Preferences

## ⚠️ SESSION START - READ FIRST

**Before making any changes, read `.claude/rules.md` for project standards.**

Key requirements:
- **NEVER commit directly to main** - always create a feature branch first
- **One responsibility per commit** - split multiple changes into separate commits
- **Use glancey** for semantic code search, not Grep/Read for exploration

## Command Preferences

**Use modern CLI tools when available:**
- Use `fd` instead of `find` for file searching (faster, simpler syntax)
- Use `rg` (ripgrep) instead of `grep` for content searching (faster, better defaults)
- These tools are available on this system and should always be preferred

## Semantic Code Search

This project uses **glancey** for semantic code search. When exploring the codebase:

1. Use `search_code` tool to find relevant code using natural language queries
2. Run `index_codebase` if the index appears out of date
3. Prefer semantic search over manual file exploration for understanding code patterns and finding implementations

## OpenAI Policy

**NEVER use any OpenAI products or services.** This includes:
- OpenAI API (GPT models, embeddings, etc.)
- OpenAI SDKs or libraries
- ChatGPT
- DALL-E
- Whisper API
- Any other OpenAI service

For embeddings, use **Jina** or **Ollama** instead.

## Pre-Commit Checklist

**STOP! Before committing, verify:**

1. [ ] Read `.claude/rules.md` (required every time)
2. [ ] On a feature branch, NOT main (`git branch --show-current`)
3. [ ] Each commit has exactly ONE responsibility
4. [ ] Subject line under 72 characters, imperative mood
5. [ ] Body contains ONLY "Co-Authored-By: Claude <noreply@anthropic.com>"

```bash
# Create feature branch first!
git checkout -b feature/your-feature-name
```
