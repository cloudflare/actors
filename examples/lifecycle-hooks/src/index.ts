import { Actor, handler } from "../../../packages/core/src";

export class MyActor extends Actor<Env> {
	protected override onRequest(request: Request): Promise<Response> {
		const url = new URL(request.url);
		console.log(`Actor is handling request: ${request.method} ${url.pathname}`);
		return Promise.resolve(new Response(`Hello, World! ${this.name}`));
	}

	protected override onInit(): Promise<void> {
		console.log("Actor is initialized");
		return Promise.resolve();
	}

	protected override onAlarm(_alarmInfo?: AlarmInvocationInfo): Promise<void> {
		console.log("Actor is notified of an alarm");
		return Promise.resolve();
	}
}

export default handler(MyActor);
