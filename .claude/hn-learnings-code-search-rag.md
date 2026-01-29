# Code Search & RAG Learnings

Research compiled from [HN discussion on local RAG](https://news.ycombinator.com/item?id=46616529) and related sources.

---

## Key Insight: Hybrid Search Beats Pure Embeddings

The consensus from practitioners is clear: **pure embedding-based search underperforms for code**.

> "Don't use a vector database for code, embeddings are slow and bad for code. Code likes bm25+trigram" — CuriouslyC (HN)

> "keyword search is superior to embeddings based search...BM25/tf-idf and N-grams have always been extremely difficult to beat baselines" — Der_Einzige (HN)

### Why BM25 Works Better for Code

1. **Exact matches matter**: Variable names, function names, and imports are precise identifiers
2. **Speed**: BM25 operates in milliseconds via inverted indexes (PubMed: 82ms avg over 24M documents)
3. **Zero-shot support**: Works for proprietary/low-resource languages without training data
4. **Interpretable**: Results are explainable via term frequency

### Why Embeddings Still Add Value

1. **Semantic understanding**: "authentication middleware" finds `verifyToken()` even without keyword match
2. **Query intent**: Embeddings capture what the user *means*, not just what they typed
3. **File path/symbol matching**: Works well for structural queries (ehsanu1, HN)

### The Winning Formula: Hybrid Search

[Sourcegraph's implementation](https://sourcegraph.com/blog/keeping-it-boring-and-relevant-with-bm25f) showed **~20% improvement** using BM25F for code search:

```
Recommended approach:
1. BM25 retrieves top 200-500 candidates (fast, high recall)
2. Embeddings rerank that subset (precise, semantic)
3. Optional: Cross-encoder for final top-K refinement
```

**lance-context already implements hybrid search** at `indexer.ts:559-571` with 70% semantic / 30% keyword weighting. Consider:
- Tuning these weights based on query type
- Implementing BM25F (field-weighted) for file paths vs code body

---

## Chunking Strategy: AST-Aware is Superior

> "The real challenge wasn't model quality—it was the chunking strategy" — jackfranklyn (HN)

### Problems with Naive Text Splitting

- Cuts functions mid-statement
- Separates methods from their class context
- Embeddings see truncated variables with no understanding of scope
- **Can actually hurt LLM performance and increase hallucinations** (Qodo)

### AST-Based Chunking Benefits

[Research from CMU (cAST paper)](https://arxiv.org/abs/2506.15655) showed:
- **+4.3 points Recall@5** on RepoEval retrieval
- **+2.67 points Pass@1** on SWE-bench generation

[Benchmarks from code-chunk](https://supermemory.ai/blog/building-code-chunk-ast-aware-code-chunking/):

| Chunker | Recall@5 | IoU@5 |
|---------|----------|-------|
| AST-aware | 70.1% | 0.43 |
| Fixed-size | 42.4% | 0.34 |

### Recommended AST Chunking Approach

1. **Parse with tree-sitter** (powers Neovim, Helix) — already using TS compiler in lance-context
2. **Extract semantic units**: functions, classes, methods with full signatures
3. **Preserve context**: Include imports, docstrings, parent class info
4. **Handle oversized nodes**: Recursively chunk children, don't truncate
5. **Greedy window packing**: Fill chunks with complete syntactic units

**lance-context already does this** via `ASTChunker` for TS/JS. Consider extending to more languages.

---

## Advanced Technique: Natural Language Descriptions

[Qodo's approach](https://www.qodo.ai/blog/rag-for-large-scale-code-repos/) for bridging the semantic gap:

> Code embeddings often don't capture the semantic meaning of code, especially for natural language queries.

**Solution**: Generate LLM descriptions for each chunk:

```
Code: function mapFinishReason(reason) { ... }

Generated description: "Python function that standardizes finish
reasons from various AI platforms, mapping platform-specific
reasons to common terms like 'stop', 'length', 'content_filter'."
```

Then embed **both** the code and description, or use the description as the primary embedding target.

**Trade-off**: Requires LLM call per chunk (expensive for initial index, but one-time cost)

---

## Practical Recommendations for lance-context

### Quick Wins

1. **Expose BM25 weight as config option** — Let users tune `semantic:keyword` ratio
2. **Add trigram support** — Improves partial identifier matching
3. **Field-weighted BM25F** — Boost file path and symbol matches (Sourcegraph uses 5x boost)

### Medium-Term Improvements

4. **Pre-filter by file metadata** — 85% of use cases can filter before vector search (eb0la, HN)
5. **Reciprocal Rank Fusion (RRF)** — Better than weighted average for combining retrieval methods
6. **Expand AST support** — Python (tree-sitter-python), Go, Rust are high-value targets

### Research-Worthy Ideas

7. **LLM-generated descriptions** — Embed natural language summaries alongside code
8. **Line-level BM25** — Secondary ranking within files (Sourcegraph approach)
9. **Graph-based retrieval** — Map relationships between symbols for complex queries

---

## Tools & Resources Mentioned

### Vector Databases
- **LanceDB** — Already using, good choice for embedded use
- **SQLite + sqlite-vec** — Lightweight alternative
- **Qdrant** — Production-grade, good hybrid search support
- **DuckDB** — Handles datasets under 1TB well

### Search Enhancement
- **PostgreSQL + pgvector + ParadeDB** — Hybrid BM25/vector
- **Meilisearch, Typesense** — Out-of-box hybrid search

### Embedding Models
- **nomic-embed-text** (Ollama) — Already using, good local option
- **text-embedding-3-small** (OpenAI) — Already supported
- **gemini-embedding-001** — Already supported (free tier)
- **sentence-transformers/all-MiniLM-L6-v2** — Fast, decent quality

### Code-Specific Tools
- **tree-sitter** — Multi-language AST parsing
- **CodeT5** — Code-specific embeddings
- **code-chunk** — AST-aware chunking library

---

## Key Papers & Articles

1. [Sourcegraph: BM25F for Code Search](https://sourcegraph.com/blog/keeping-it-boring-and-relevant-with-bm25f) — Production implementation details
2. [cAST: AST-Based Code Chunking (CMU)](https://arxiv.org/abs/2506.15655) — Academic evaluation of chunking strategies
3. [Building code-chunk](https://supermemory.ai/blog/building-code-chunk-ast-aware-code-chunking/) — Practical AST chunking implementation
4. [Qodo: RAG for 10k Repos](https://www.qodo.ai/blog/rag-for-large-scale-code-repos/) — Enterprise-scale approaches
5. [Qdrant: Hybrid Search Reranking](https://qdrant.tech/documentation/advanced-tutorials/reranking-hybrid-search/) — Three-tier retrieval architecture
6. [Hybrid Search Guide (Medium)](https://medium.com/@mahima_agarwal/hybrid-search-bm25-vector-embeddings-the-best-of-both-worlds-in-information-retrieval-0d1075fc2828) — Conceptual overview

---

## Summary

| Aspect | Current State | Recommended Direction |
|--------|---------------|----------------------|
| Search | Hybrid (70/30) | Tune weights, add BM25F field boosting |
| Chunking | AST for TS/JS | Extend to Python, Go, Rust |
| Embeddings | Multi-backend | Consider code-specific models |
| Ranking | Single-stage | Add RRF fusion, reranking stage |

The lance-context architecture is fundamentally sound. The hybrid search and AST chunking already implement best practices. Main opportunities are in tuning and extending language support.
