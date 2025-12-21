import {
	Actor,
	type ActorConfiguration,
	handler,
} from "../../../packages/core/src";

export class MyActor extends Actor<Env> {
	static configuration(_request: Request): ActorConfiguration {
		return { locationHint: "apac" };
	}

	async fetch(_request: Request): Promise<Response> {
		return new Response(`Hello, World!`);
	}
}

export default handler(MyActor);
