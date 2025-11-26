import { describe, expect, it } from "vitest";
import { __test } from "./persist";

const { createDeepProxy } = __test;

// No-op trigger for testing (we don't need persistence in these tests)
const noopTrigger = () => {};

/**
 * Helper to create a proxy using the real createDeepProxy function.
 * Uses minimal mock instance and property key for testing purposes.
 */
function createTestProxy<T extends object>(value: T): T {
  return createDeepProxy(value, {}, "testProp", noopTrigger);
}

describe("persist proxy - null auto-vivification bug", () => {
  it("should NOT mutate null properties to {} when reading them", () => {
    // This is the bug: reading a null property through the proxy
    // should return null, not auto-vivify it to {}
    const original = {
      ownerId: null as string | null,
      name: "test",
    };

    const proxied = createTestProxy(original);

    // Read the null property
    const ownerId = proxied.ownerId;

    // Should return null as-is without mutation
    expect(ownerId).toBe(null);
    expect(original.ownerId).toBe(null);
  });

  it("should preserve null values in object spread", () => {
    const original = {
      id: "match_123",
      ownerId: null as string | null,
      firstMoveMadeAt: null as number | null,
      completedAt: null as number | null,
    };

    const proxied = createTestProxy(original);

    // Spread the proxied object (this is what our code does)
    const copy = { ...proxied };

    // Spread should preserve null values
    expect(copy.ownerId).toBe(null);
    expect(copy.firstMoveMadeAt).toBe(null);
    expect(copy.completedAt).toBe(null);

    // The original should NOT be mutated by a read operation
    expect(original.ownerId).toBe(null);
  });

  it("should NOT mutate the underlying object on property read", () => {
    const original = { nullProp: null as null };
    const proxied = createTestProxy(original);

    // Just reading should not mutate
    void proxied.nullProp;

    // The underlying object should remain unchanged
    expect(original.nullProp).toBe(null);
  });

  it("real-world: D1 journaling with nullable fields", () => {
    // Real-world scenario: match state with nullable fields
    // When serialized to D1, null values must be preserved
    interface MatchState {
      id: string;
      ownerId: string | null;
      firstMoveMadeAt: number | null;
      completedAt: number | null;
    }

    const matchState: MatchState = {
      id: "match_123",
      ownerId: null,
      firstMoveMadeAt: null,
      completedAt: null,
    };

    const proxied = createTestProxy(matchState);

    // When we journal to D1, null values should be preserved
    expect(proxied.ownerId).toBe(null);
    expect(proxied.firstMoveMadeAt).toBe(null);
    expect(proxied.completedAt).toBe(null);

    // Verify the original wasn't corrupted
    expect(matchState.ownerId).toBe(null);
    expect(matchState.firstMoveMadeAt).toBe(null);
    expect(matchState.completedAt).toBe(null);
  });
});
