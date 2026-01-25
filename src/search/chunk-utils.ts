/**
 * Shared utilities for code chunking.
 */

/**
 * Base interface for code chunks.
 * Both ASTChunk and TreeSitterChunk share this structure.
 */
export interface BaseChunk {
  content: string;
  startLine: number;
  endLine: number;
  type: 'function' | 'class' | 'method' | 'interface' | 'type' | 'variable' | 'import' | 'other';
  name?: string;
}

/**
 * Split a large chunk into smaller pieces.
 *
 * @param chunk - The chunk to split
 * @param maxLines - Maximum lines per chunk
 * @param minLines - Minimum lines for a chunk (avoid tiny fragments)
 * @returns Array of smaller chunks
 */
export function splitLargeChunk<T extends BaseChunk>(
  chunk: T,
  maxLines: number,
  minLines: number
): T[] {
  const chunkLines = chunk.content.split('\n');
  const totalLines = chunkLines.length;
  const chunks: T[] = [];

  // Split into roughly equal parts, each under maxLines
  const numParts = Math.ceil(totalLines / maxLines);
  const linesPerPart = Math.ceil(totalLines / numParts);

  for (let i = 0; i < numParts; i++) {
    const startIdx = i * linesPerPart;
    const endIdx = Math.min((i + 1) * linesPerPart, totalLines);
    const partLines = chunkLines.slice(startIdx, endIdx);

    if (partLines.length < minLines && chunks.length > 0) {
      // Merge with previous chunk if too small
      const lastChunk = chunks[chunks.length - 1];
      lastChunk.content += '\n' + partLines.join('\n');
      lastChunk.endLine = chunk.startLine + endIdx - 1;
    } else {
      chunks.push({
        ...chunk,
        content: partLines.join('\n'),
        startLine: chunk.startLine + startIdx,
        endLine: chunk.startLine + endIdx - 1,
        name: chunk.name ? `${chunk.name} (part ${i + 1})` : undefined,
      } as T);
    }
  }

  return chunks;
}
