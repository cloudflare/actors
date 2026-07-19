import { describe, it, expect, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({
  env: {},
  DurableObject: class {
    constructor(ctx, env) {
      this.ctx = ctx;
      this.env = env;
    }
  },
  WorkerEntrypoint: class {}
}));

import { ParallelChunker } from "./ParallelChunker";
import { createDurableObjectStateMock } from "./test-utils/mockDurableObjectState";

describe("ParallelChunker", () => {
  it("should split payload correctly based on chunk size", () => {
    const state = createDurableObjectStateMock();
    const chunker = new ParallelChunker(state, {});
    
    const text = "Line 1\nLine 2\nLine 3\nLine 4";
    const chunks = chunker.splitPayload(text, 14); // "Line 1\nLine 2" is 13 chars
    
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0]).toContain("Line 1");
  });

  it("should process items in parallel", async () => {
    const state = createDurableObjectStateMock();
    const chunker = new ParallelChunker(state, {});
    const items = [1, 2, 3];
    const results = await chunker.chunk(items, async (item) => item * 2);
    
    expect(results).toEqual([2, 4, 6]);
  });
});
