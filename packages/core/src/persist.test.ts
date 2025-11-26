import { describe, expect, it } from "vitest";

// Symbol to mark an object as proxied
const IS_PROXIED = Symbol("IS_PROXIED");

/**
 * Minimal reproduction of the createDeepProxy function from persist.ts
 * to test the null auto-vivification bug in isolation.
 *
 * This replicates the buggy behavior from lines 83-90 of persist.ts
 */
function createBuggyProxy<T extends object>(value: T): T {
  const proxy = new Proxy(value as object, {
    get(target: object, key: string | symbol): unknown {
      if (key === IS_PROXIED) return true;

      if (typeof key === "symbol") {
        return Reflect.get(target, key);
      }

      const prop = Reflect.get(target, key);

      // BUG: This auto-vivifies null to {} on READ operations
      // The proxy MUTATES the underlying object when reading a null property
      // This is the exact logic from persist.ts lines 83-90
      if (
        (prop === null || prop === undefined) &&
        typeof key === "string" &&
        !key.startsWith("_") &&
        key !== "length"
      ) {
        const newObj = {};
        Reflect.set(target, key, newObj); // <-- MUTATES the underlying object!
        return newObj;
      }

      return prop;
    },
  });

  return proxy as T;
}

describe("persist proxy - null auto-vivification bug", () => {
  it("should NOT mutate null properties to {} when reading them", () => {
    // This is the bug: reading a null property through the proxy
    // should return null, not auto-vivify it to {}
    const original = {
      ownerId: null as string | null,
      name: "test",
    };

    const proxied = createBuggyProxy(original);

    // Read the null property
    const ownerId = proxied.ownerId;

    // BUG: Currently ownerId is {} instead of null
    // and original.ownerId has been mutated to {}
    expect(ownerId).toBe(null); // FAILS - gets {}
    expect(original.ownerId).toBe(null); // FAILS - mutated to {}
  });

  it("should preserve null values in object spread", () => {
    const original = {
      id: "match_123",
      ownerId: null as string | null,
      firstMoveMadeAt: null as number | null,
      completedAt: null as number | null,
    };

    const proxied = createBuggyProxy(original);

    // Spread the proxied object (this is what our code does)
    const copy = { ...proxied };

    // BUG: Spread triggers get() for each property
    // null properties get auto-vivified to {}
    expect(copy.ownerId).toBe(null); // FAILS - gets {}
    expect(copy.firstMoveMadeAt).toBe(null); // FAILS - gets {}
    expect(copy.completedAt).toBe(null); // FAILS - gets {}

    // The original should NOT be mutated by a read operation
    expect(original.ownerId).toBe(null); // FAILS - mutated to {}
  });

  it("should NOT mutate the underlying object on property read", () => {
    const original = { nullProp: null as null };
    const proxied = createBuggyProxy(original);

    // Just reading should not mutate
    void proxied.nullProp;

    // BUG: The underlying object has been mutated
    expect(original.nullProp).toBe(null); // FAILS - mutated to {}
  });

  it("real-world: D1 journaling with nullable fields", () => {
    // Real-world scenario: match state with nullable fields
    // When serialized to D1, {} becomes "[object Object]" instead of NULL
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

    const proxied = createBuggyProxy(matchState);

    // When we journal to D1, we need these null values
    // BUG: They get auto-vivified to {} which serializes as "[object Object]"
    expect(proxied.ownerId).toBe(null);
    expect(proxied.firstMoveMadeAt).toBe(null);
    expect(proxied.completedAt).toBe(null);

    // Verify the original wasn't corrupted
    expect(matchState.ownerId).toBe(null);
    expect(matchState.firstMoveMadeAt).toBe(null);
    expect(matchState.completedAt).toBe(null);
  });
});
