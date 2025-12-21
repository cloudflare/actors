import { Actor, Entrypoint, handler } from "../../../packages/core/src";

// -----------------------------------------------------
// Example response without explicitly defining a Worker
// -----------------------------------------------------
export default handler((_request: Request) => {
	return new Response("Hello, World!");
});

// --------------------------------------------------
// Example Entrypoint as an entrypoint to the handler
// --------------------------------------------------
export class MyWorker extends Entrypoint<Env> {
	async fetch(_request: Request): Promise<Response> {
		return new Response("Hello, World!");
	}
}
// export default handler(MyWorker);

// ----------------------------------------------
// Example Actor as an entrypoint to the handler
// ----------------------------------------------
export class MyActor extends Actor<Env> {
	async fetch(_request: Request): Promise<Response> {
		return new Response(`Hello, World!`);
	}
}
// export default handler(MyActor);
