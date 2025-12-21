import { Hono } from "hono";
import { Actor, handler } from "../../../packages/core/src";

// Hono inside of an Actor
export class MyActor extends Actor<any> {
	async fetch(request: Request): Promise<Response> {
		const app = new Hono();

		app.get("/health", async (c) => {
			return c.text("ok");
		});

		return app.fetch(request);
	}

	async customAddFunction(a: number, b: number): Promise<number> {
		return a + b;
	}
}

export default handler(MyActor);

// Call into an Actor
// const app = new Hono();

// app.get("/health", async (c) => {
//     const actor = MyActor.get("default");

//     // RPC into an Actor
//     const calculated = await actor.customAddFunction(1, 100);
//     console.log('RPC Result: ', calculated);

//     // ..or pass a fetch request into the Actor
//     return actor.fetch(c.req.raw)
// });

// export default app;
