import { describe, expect, it } from "vitest";
import {
	isErrorRetryable,
	jitterBackoff,
	RetryConditionAlways,
	tryN,
	tryWhile,
} from "./retries";

describe("retries", async () => {
	it("jitterBackoff", async () => {
		const baseDelayMs = 100;
		const maxDelayMs = 3000;
		const attempts = 10000;

		const delays = new Set();
		for (let i = 0; i < attempts; i++) {
			const delay = jitterBackoff(i, baseDelayMs, maxDelayMs);
			delays.add(delay);
			expect(delay).toBeGreaterThanOrEqual(0);
			expect(delay).toBeLessThanOrEqual(maxDelayMs);
		}
		// Might be flaky, so keep an eye, but we should have a good spread of delays.
		// Testing that we have at least 50% of the possible delays.
		expect(delays.size).toBeGreaterThan(maxDelayMs * 0.5);
	});

	describe("tryN", async () => {
		it("tryN", async () => {
			// Custom options.
			let attempts = 0;
			const result = await tryN(
				10,
				async () => {
					attempts++;
					if (attempts < 5) {
						throw new Error("retry");
					}
					return "ok";
				},
				{
					baseDelayMs: 1,
					maxDelayMs: 10,
					isRetryable: (err) => (err as any).message === "retry",
				}
			);
			expect(result).toEqual("ok");
			expect(attempts).toEqual(5);

			// Default options.
			let attempts2 = 0;
			const result2 = await tryN(10, async () => {
				attempts2++;
				if (attempts2 < 3) {
					throw new Error("retry");
				}
				return "ok";
			});
			expect(result2).toEqual("ok");
			expect(attempts2).toEqual(3);

			// Retry all attempts.
			let attempts3 = 0;
			await expect(
				tryN(
					5,
					async () => {
						attempts3++;
						throw new Error("retry");
					},
					{ baseDelayMs: 1, maxDelayMs: 10 }
				)
			).rejects.toThrow("retry");
			expect(attempts3).toEqual(5);
		});

		it("tryN invalid inputs", async () => {
			const doer = async () => 11;
			await expect(tryN(0, doer)).rejects.toThrow("n must be greater than 0");
			await expect(tryN(1, doer, { baseDelayMs: 0 })).rejects.toThrow(
				"baseDelayMs and maxDelayMs must be greater than 0"
			);
			await expect(tryN(1, doer, { maxDelayMs: 0 })).rejects.toThrow(
				"baseDelayMs and maxDelayMs must be greater than 0"
			);
		});
	});

	describe("trywhile", async () => {
		it("tryWhile usage", async () => {
			// Custom options.
			let attempts = 0;
			const result = await tryWhile(
				async () => {
					attempts++;
					if (attempts < 5) {
						throw new Error("retry");
					}
					return "ok";
				},
				(err) => (err as any).message === "retry",
				{
					baseDelayMs: 1,
					maxDelayMs: 10,
				}
			);
			expect(result).toEqual("ok");
			expect(attempts).toEqual(5);

			// Default options.
			let attempts2 = 0;
			const result2 = await tryWhile(async () => {
				attempts2++;
				if (attempts2 < 3) {
					throw new Error("retry");
				}
				return "ok";
			}, RetryConditionAlways);
			expect(result2).toEqual("ok");
			expect(attempts2).toEqual(3);

			// Retry all attempts.
			let attempts3 = 0;
			await expect(
				tryWhile(
					async () => {
						attempts3++;
						throw new Error("retry");
					},
					(_err, nextAttempt) => nextAttempt <= 5,
					{ baseDelayMs: 1, maxDelayMs: 10 }
				)
			).rejects.toThrow("retry");
			expect(attempts3).toEqual(5);
		});
	});
});

describe("isErrorRetryable", async () => {
	function retryableError(msg: string) {
		const e = new Error(msg);
		(e as any).retryable = true;
		return e;
	}

	const overloadedErrors = [
		"Durable Object is overloaded. Too many requests queued.",
		"Durable Object is overloaded. Requests queued for too long.",
		"Durable Object is overloaded. Too many requests for the same object within a 10 second window.",
	];

	it.each(
		overloadedErrors
	)(`overloaded errors should not be retried - message only - %i`, async (emsg: string) => {
		expect(isErrorRetryable(retryableError(emsg))).toBe(false);
	});

	it("overloaded errors should not be retried - property only", async () => {
		const e = retryableError(
			"non-expected overloaded error with the overloaded property"
		);
		(e as any).overloaded = true;
		expect(isErrorRetryable(e)).toBe(false);
	});

	it("non-retryable errors should not be retried", async () => {
		expect(isErrorRetryable(new Error("Network connection lost."))).toBe(false);
	});

	it("non-overloaded and retryable errors should be retried", async () => {
		expect(isErrorRetryable(retryableError("not overloaded"))).toBe(true);
		expect(isErrorRetryable(retryableError("Network connection lost."))).toBe(
			true
		);
	});
});
