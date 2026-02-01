---
name: find-similar-code
description: Use when refactoring or before writing new code to find existing similar patterns
---

# Find Similar Code

Use this workflow to find duplicate or similar code patterns.

## When to Use

- **Before writing new code**: Check if similar functionality already exists
- **During refactoring**: Find duplicate logic that could be consolidated
- **Code review**: Identify patterns that should be unified

## How to Use

### Option 1: From a Code Snippet

If you have code you want to find similar patterns for:

```
search_similar(code="your code snippet here")
```

### Option 2: From a File Location

If you want to find code similar to a specific function or section:

```
search_similar(filepath="src/utils/auth.ts", startLine=10, endLine=25)
```

## Parameters

- `threshold`: Set minimum similarity score (0-1). Use 0.7+ for close matches, 0.5+ for related patterns
- `limit`: Number of results to return (default: 10)
- `excludeSelf`: Exclude the source chunk from results (default: true)

## Follow-up Actions

After finding similar code:
1. Review the matches to identify true duplicates
2. Consider extracting common logic to a shared utility
3. Use `search_code` to find all usages of the patterns
