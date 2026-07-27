import { Counter, Registry } from "prom-client";
import { describe, expect, it, vi } from "vitest";
import { getOrCreateRegisteredMetric } from "./metrics";

describe("getOrCreateRegisteredMetric", () => {
  it("reuses an existing process metric instead of registering it twice", () => {
    const registry = new Registry();
    const create = vi.fn(
      () =>
        new Counter({
          name: "openpbl_test_requests_total",
          help: "Test request total.",
          registers: [registry],
        }),
    );

    const first = getOrCreateRegisteredMetric(
      registry,
      "openpbl_test_requests_total",
      create,
    );
    const second = getOrCreateRegisteredMetric(
      registry,
      "openpbl_test_requests_total",
      create,
    );

    expect(second).toBe(first);
    expect(create).toHaveBeenCalledTimes(1);
  });
});
