import { Actor, ActorConfiguration, handler } from '../../../packages/core/src'

export class MySocketsActor extends Actor<Env> {
    // This is optional to implement, defaults are shown in below comments
    static configuration(request: Request): ActorConfiguration {
        return {
            sockets: {
                upgradePath: '/ws', // Also defaults to `/ws` when not present,
                autoResponse: {
                    ping: 'pong',
                    pong: 'ping'
                }
            }
        };
    }

    protected onRequest(request: Request): Promise<Response> {
        return Promise.resolve(Response.json({ message: 'Hello, World!' }));
    }

    protected shouldUpgradeSocket(request: Request): boolean {
        return true;
    }

    protected onSocketConnect(request: Request) {
        console.log('Socket connected');
    }

    protected onSocketDisconnect(ws: WebSocket) {
        console.log('Socket disconnected');
    }

    protected onSocketMessage(ws: WebSocket, message: any) {
        // Echo message back when recieved
        const senderSocketId = ws.deserializeAttachment?.()?.connectionId;
        this.sockets.message('Received!', ['*'], [senderSocketId]);
    }
}

export default handler(MySocketsActor);
