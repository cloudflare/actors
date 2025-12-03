import { describe, expect, it, vi } from "vitest";

vi.mock("cloudflare:workers", () => {
  class DurableObject {
    constructor(_state?: unknown, _env?: unknown) {}
  }

  class WorkerEntrypoint {}

  return {
    DurableObject,
    WorkerEntrypoint,
    env: {},
  };
});

import { Actor, type ActorConfiguration } from "./index";

describe("Actor configuration overrides", () => {
  it("respects custom upgrade paths defined by subclasses", async () => {
    let upgradeCalls = 0;

    class CustomPathActor extends Actor<Record<string, never>> {
      static override configuration(): ActorConfiguration {
        return {
          sockets: {
            upgradePath: "/custom",
          },
        };
      }

      protected override async shouldUpgradeWebSocket(
        request: Request,
      ): Promise<boolean> {
        return request.headers.get("Upgrade")?.toLowerCase() === "websocket";
      }

      protected override onWebSocketUpgrade(_request: Request): Response {
        upgradeCalls += 1;
        return new Response("upgraded", { status: 200 });
      }

      protected override onRequest(): Promise<Response> {
        return Promise.resolve(new Response("fallback", { status: 418 }));
      }
    }

    const actor = new CustomPathActor(undefined, undefined);
    (actor as Record<string, unknown>)["_setNameCalled"] = true;

    const upgradeResponse = await actor.fetch(
      new Request("https://example.com/custom/game", {
        headers: { Upgrade: "websocket" },
      }),
    );
    // Node/undici Response objects cannot emit 101, so we just ensure the response we returned flows through.
    expect(upgradeResponse.status).toBe(200);
    expect(upgradeCalls).toBe(1);

    const fallbackResponse = await actor.fetch(
      new Request("https://example.com/ws/game"),
    );
    expect(fallbackResponse.status).toBe(418);
    expect(upgradeCalls).toBe(1);
  });
});
