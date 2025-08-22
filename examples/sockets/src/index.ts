import { Actor, ActorConfiguration, handler } from '../../../packages/core/src'

export class MySocketsActor extends Actor<Env> {
    // This is optional to implement, defaults are shown in below comments
    static configuration(request: Request): ActorConfiguration {
        return {
            sockets: {
                upgradePath: '/ws', // Also defaults to `/ws` when not present,
                autoResponse: {
                    ping: 'ping',
                    pong: 'pong'
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

    protected onSocketConnect(ws: WebSocket, request: Request) {
        console.log('Socket connected');
    }

    protected onSocketDisconnect(ws: WebSocket) {
        console.log('Socket disconnected');
    }

    protected onSocketMessage(ws: WebSocket, message: any) {
        // Echo message back to everyone except the sender
        this.sockets.message('Received!', '*', [ws]);
    }
}

export default handler(MySocketsActor);
