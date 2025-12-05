import { describe, expect, it } from "vitest";
import { unwrapProxy, IS_PROXIED } from "./persist";

describe("unwrapProxy", () => {
  describe("prototype pollution prevention", () => {
    it("ignores __proto__ key in proxied objects", () => {
      const malicious = JSON.parse('{"__proto__": {"polluted": true}, "safe": 1}');
      malicious[IS_PROXIED] = true;
      const result = unwrapProxy(malicious);

      expect(result.safe).toBe(1);
      // Malicious __proto__ value not copied as own property
      expect(Object.prototype.hasOwnProperty.call(result, '__proto__')).toBe(false);
      // Global Object.prototype not polluted
      expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    });

    it("ignores constructor key in proxied objects", () => {
      const malicious = { constructor: { prototype: { polluted: true } }, safe: 1, [IS_PROXIED]: true };
      const result = unwrapProxy(malicious);

      expect(result.safe).toBe(1);
      // Malicious constructor value not copied as own property
      expect(Object.prototype.hasOwnProperty.call(result, 'constructor')).toBe(false);
      // Inherited constructor is standard Object constructor
      expect(result.constructor).toBe(Object);
    });

    it("ignores prototype key in proxied objects", () => {
      const malicious = { prototype: { polluted: true }, safe: 1, [IS_PROXIED]: true };
      const result = unwrapProxy(malicious);

      expect(result.safe).toBe(1);
      expect(result.prototype).toBeUndefined();
    });

    it("filters dangerous keys in nested proxied objects", () => {
      const nested = JSON.parse('{"__proto__": {"polluted": true}, "valid": 2}');
      nested[IS_PROXIED] = true;
      const malicious = {
        nested,
        safe: 1,
      };
      const result = unwrapProxy(malicious);

      expect(result.safe).toBe(1);
      expect(result.nested.valid).toBe(2);
      // Malicious __proto__ value not copied as own property
      expect(Object.prototype.hasOwnProperty.call(result.nested, '__proto__')).toBe(false);
    });

    it("proxied object result has standard prototype", () => {
      const input = { a: 1, [IS_PROXIED]: true };
      const result = unwrapProxy(input);

      expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
    });

    it("non-proxied objects returned unchanged (fast path)", () => {
      const input = { a: 1 };
      const result = unwrapProxy(input);

      expect(result).toBe(input);
      expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
    });

    it("nested proxy triggers full unwrap", () => {
      const input = { outer: { inner: { [IS_PROXIED]: true, val: 1 } } };
      const result = unwrapProxy(input);

      expect(result).not.toBe(input);
      expect(result.outer.inner.val).toBe(1);
      expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
    });

    it("non-proxied array returned unchanged", () => {
      const input = [1, 2, { a: 3 }];
      const result = unwrapProxy(input);

      expect(result).toBe(input);
    });

    it("array containing proxy triggers unwrap", () => {
      const input = [1, { [IS_PROXIED]: true, val: 2 }];
      const result = unwrapProxy(input);

      expect(result).not.toBe(input);
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe("basic functionality", () => {
    it("handles primitives", () => {
      expect(unwrapProxy(null)).toBeNull();
      expect(unwrapProxy(undefined)).toBeUndefined();
      expect(unwrapProxy(42)).toBe(42);
      expect(unwrapProxy("str")).toBe("str");
      expect(unwrapProxy(true)).toBe(true);
    });

    it("handles arrays", () => {
      const input = [1, { a: 2 }, [3]];
      const result = unwrapProxy(input);

      expect(result).toEqual([1, { a: 2 }, [3]]);
      expect(Array.isArray(result)).toBe(true);
    });

    it("handles nested objects", () => {
      const input = { a: { b: { c: 1 } } };
      const result = unwrapProxy(input);

      expect(result.a.b.c).toBe(1);
    });

    it("handles circular references", () => {
      const obj: Record<string, unknown> = { a: 1 };
      obj.self = obj;

      const result = unwrapProxy(obj);

      expect(result.a).toBe(1);
      expect(result.self).toBe(result);
    });

    it("handles Map", () => {
      const input = new Map([["key", { value: 1 }]]);
      const result = unwrapProxy(input);

      expect(result instanceof Map).toBe(true);
      expect(result.get("key")).toEqual({ value: 1 });
    });

    it("handles Set", () => {
      const input = new Set([1, 2, { a: 3 }]);
      const result = unwrapProxy(input);

      expect(result instanceof Set).toBe(true);
      expect(result.size).toBe(3);
    });

    it("preserves Date instances", () => {
      const date = new Date("2024-01-01");
      const result = unwrapProxy(date);

      expect(result).toBe(date);
    });

    it("preserves RegExp instances", () => {
      const regex = /test/gi;
      const result = unwrapProxy(regex);

      expect(result).toBe(regex);
    });

    it("preserves Error instances", () => {
      const error = new Error("test");
      const result = unwrapProxy(error);

      expect(result).toBe(error);
    });
  });
});
