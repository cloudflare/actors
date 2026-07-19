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

import { PuppeteerScraper } from "./PuppeteerScraper";
import { createDurableObjectStateMock } from "./test-utils/mockDurableObjectState";

describe("PuppeteerScraper", () => {
  it("should fallback to fetch if browser binding is missing", async () => {
    // Mock fetch
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => "fallback content",
    } as any);

    const state = createDurableObjectStateMock();
    const scraper = new PuppeteerScraper(state, {});
    const result = await scraper.scrape("https://example.com");
    
    expect(result).toBe("fallback content");
    expect(global.fetch).toHaveBeenCalledWith(
      "https://example.com",
      expect.objectContaining({
        headers: expect.objectContaining({
          "User-Agent": expect.any(String)
        })
      })
    );
  });
});
