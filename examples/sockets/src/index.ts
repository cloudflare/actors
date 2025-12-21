import { Actor, ActorConfiguration, handler } from "../../../packages/core/src";

export class MySocketsActor extends Actor<Env> {
	// This is optional to implement, defaults are shown in below comments
	static configuration(request: Request): ActorConfiguration {
		return {
			sockets: {
				upgradePath: "/ws", // Also defaults to `/ws` when not present,
				autoResponse: {
					ping: "ping",
					pong: "pong",
				},
			},
		};
	}

	protected onRequest(request: Request): Promise<Response> {
		return Promise.resolve(Response.json({ message: "Hello, World!" }));
	}

	protected async shouldUpgradeWebSocket(request: Request): Promise<boolean> {
		return true;
	}

	protected onWebSocketConnect(ws: WebSocket, request: Request) {
		console.log("Socket connected");
	}

	protected onWebSocketDisconnect(ws: WebSocket) {
		console.log("Socket disconnected");
	}

	protected onWebSocketMessage(ws: WebSocket, message: any) {
		console.log("WebSocket message received:", ws, message);
		// Echo message back to everyone except the sender
		console.log(this.sockets);
		this.sockets.message("Received!", "*", [ws]);
	}
}

export default handler(MySocketsActor);
