---
name: codebase-onboarding
description: Use when starting work on a new or unfamiliar codebase to get oriented quickly
---

# Codebase Onboarding

Follow this workflow to quickly understand a new codebase:

## Step 1: Get the Big Picture

Use `summarize_codebase` to get:
- File statistics and language distribution
- Discovered concept areas (semantic clusters)
- Overall codebase structure

## Step 2: Explore Concept Areas

Use `list_concepts` to see all semantic groupings, then use `search_by_concept` to explore specific areas of interest.

## Step 3: Search by Concept

When you need to find specific functionality, use `search_code` with natural language queries like:
- "how does authentication work"
- "error handling patterns"
- "database connection setup"

## Important

- Always use lance-context's semantic search tools over grep/find when exploring
- The index must be built first - check with `get_index_status`
- If index is stale, run `index_codebase`
