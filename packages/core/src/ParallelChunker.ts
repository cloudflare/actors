import { Actor } from "./actor";

export class ParallelChunker<E = any> extends Actor<E> {
  /**
   * Splits a task payload or collection into chunks and executes them in parallel.
   */
  public async chunk<T, R>(
    items: T[],
    processFn: (item: T) => Promise<R>
  ): Promise<R[]> {
    const promises = items.map(item => processFn(item));
    return Promise.all(promises);
  }

  /**
   * Splits a string or large payload into size-bounded segments.
   */
  public splitPayload(text: string, maxChunkSize: number = 40000): string[] {
    if (text.length <= maxChunkSize) {
      return [text];
    }

    const lines = text.split("\n");
    const chunks: string[] = [];
    let current = "";

    for (const line of lines) {
      if ((current + "\n" + line).length > maxChunkSize && current) {
        chunks.push(current);
        current = line;
      } else {
        current = current ? current + "\n" + line : line;
      }
    }
    if (current) {
      chunks.push(current);
    }
    return chunks;
  }
}
