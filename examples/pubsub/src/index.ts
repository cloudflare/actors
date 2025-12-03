import { Actor, Entrypoint, handler } from "../../../packages/core/src";

export class PubSubService extends Actor<Env> {
  private subscribers = new Set<ReadableStreamDefaultController<Uint8Array>>();

  async subscribe(): Promise<ReadableStream<Uint8Array>> {
    let controller: ReadableStreamDefaultController<Uint8Array>;

    return new ReadableStream({
      start: (ctrl) => {
        controller = ctrl;
        this.subscribers.add(controller);
      },
      cancel: () => {
        this.subscribers.delete(controller);
      },
    });
  }

  async publish(message: string): Promise<void> {
    const messageData = JSON.stringify({
      message,
      timestamp: Date.now(),
      service: this.identifier,
    });

    const encodedMessage = new TextEncoder().encode(messageData + "\n");

    const subscribersToRemove: ReadableStreamDefaultController<Uint8Array>[] =
      [];

    this.subscribers.forEach((controller) => {
      try {
        controller.enqueue(encodedMessage);
      } catch (e) {
        subscribersToRemove.push(controller);
      }
    });

    subscribersToRemove.forEach((controller) => {
      this.subscribers.delete(controller);
    });
  }
}

export class PubSubClient extends Entrypoint<Env> {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const pathParts = url.pathname.split("/").filter((part) => part.length > 0);

    const [action, serviceName] = pathParts;

    if (!serviceName) {
      return new Response("Service name is required", { status: 400 });
    }

    const service = PubSubService.get(serviceName);

    if (request.method === "GET" && action === "subscribe") {
      const stream = await service.subscribe();

      return new Response(stream, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }

    if (request.method === "POST" && action === "publish") {
      const message = await request.text();

      if (!message.trim()) {
        return new Response("Message body is required", { status: 400 });
      }

      await service.publish(message);

      return new Response("Message published successfully", { status: 200 });
    }

    return new Response(
      "Not found. Use GET /subscribe/{service} or POST /publish/{service}",
      {
        status: 404,
      },
    );
  }
}

export default handler(PubSubClient);
