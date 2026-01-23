# Claude Code Preferences

## Command Preferences

- Use `fd` instead of `find` for file searching

## Semantic Code Search

This project uses **lance-context** for semantic code search. When exploring the codebase:

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

## Commit Guidelines

Review `.claude/rules.md` before committing. Key rules:
- One responsibility per commit
- Subject line under 72 characters
- Imperative mood ("Add" not "Added")
- Body contains only "Co-Authored-By: Claude <noreply@anthropic.com>"
