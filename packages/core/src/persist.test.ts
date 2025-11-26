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

describe("persist proxy - error handler heap overflow bug", () => {
  it("should return undefined on error instead of creating infinite proxy chain", () => {
    // Create an object with a throwing getter
    const throwingObj = {
      get badProp(): never {
        throw new Error("This getter throws");
      },
      normalProp: "hello",
    };

    const proxied = createTestProxy(throwingObj);

    // Accessing the throwing getter should return undefined, not create {} and recurse
    // Before the fix, this would cause a heap overflow from infinite proxy recursion
    const result = proxied.badProp;

    expect(result).toBe(undefined);
    // The normal prop should still work
    expect(proxied.normalProp).toBe("hello");
  });

  it("should not corrupt the original object on error", () => {
    const original: Record<string, any> = {
      get explosive(): never {
        throw new Error("boom");
      },
    };

    const proxied = createTestProxy(original);

    // Access the throwing getter
    void proxied.explosive;

    // The original should not be mutated with {}
    // Check that 'explosive' is still a getter, not {}
    const descriptor = Object.getOwnPropertyDescriptor(original, "explosive");
    expect(descriptor?.get).toBeDefined();
  });
});
