import { DurableObject } from "cloudflare:workers";

type RecipientType = string | WebSocket;

type WebSocketWithMetadata = WebSocket & {
    serializeAttachment?(attachment: any): void;
    deserializeAttachment?(): any;
}

export class Sockets<P extends DurableObject<any>> {
    private parent: P;
    private context: DurableObjectState | undefined;
    public connections: Map<string, WebSocketWithMetadata> = new Map();

    constructor(ctx: DurableObjectState | undefined, parent: P) {
        this.context = ctx;
        this.parent = parent;
        
        if (ctx) {
            // When the actor is initialized, we should load any existing websockets
            // that are currently connected to this actor.
            const webSockets = ctx.getWebSockets() as WebSocketWithMetadata[];
            this.connections = new Map();
            
            webSockets.forEach((socket: WebSocketWithMetadata) => {
                // Retrieve the attachment data which contains connectionId and queryParams
                const attachment = socket.deserializeAttachment?.() || {};
                
                // Use the connection ID from attachment, or generate a new one if not available
                const connectionId = attachment.connectionId || crypto.randomUUID();
                
                // Store the connection with its ID
                this.connections.set(connectionId, socket);

                // If a user wants to get access to additional metadata that was part of the query
                // params from when they established the connection, they can do so by using the
                // `deserializeAttachment` method on the socket.
                // const queryParams = socket.deserializeAttachment?.()?.queryParams || {};
            });
        }
    }

    message(message: string, to?: RecipientType[] | '*', exclude?: RecipientType[]) {
        for (const [id, socket] of this.connections.entries()) {
            // Skip if the `id` or `socket` is in the `exclude` list
            if (exclude?.includes(id) || exclude?.includes(socket)) {
              continue;
            }

            // Send to all if 'to' is '*' or empty, otherwise only to specified recipients
            if (to === "*" || !to?.length || to.includes(id) || to.includes(socket)) {
              socket.send(message);
            }
        }
    }

    async webSocketMessage(ws: WebSocketWithMetadata, message: any) {
        
    }

    async webSocketClose(
        ws: WebSocketWithMetadata,
        code: number,
    ) {
        // When a particular user has ended its websocket connection, we should 
        // find their entry in our connections map and prune it from our list we are
        // managing.
        for (const [id, socket] of this.connections.entries()) {
            if (socket === ws) {
                // Remove from connections map
                this.connections.delete(id);
                break;
            }
        }

        ws.close(code, "Durable Object is closing WebSocket");
    }

    acceptWebSocket(request: Request): {
        client: WebSocketWithMetadata;
        server: WebSocketWithMetadata;
    } {
        const webSocketPair = new WebSocketPair();
        const [client, server] = Object.values(webSocketPair) as [WebSocketWithMetadata, WebSocketWithMetadata];

        // Parse the URL and get all query parameters
        const url = new URL(request.url);
        const params = url.searchParams;
        
        // Create an object to store all query parameters
        const queryParams: Record<string, string> = {};
        params.forEach((value, key) => {
            queryParams[key] = value;
        });
        
        // If no ID was provided, generate one
        const connectionId = queryParams.id || crypto.randomUUID();
        if (!queryParams.id) {
            queryParams.id = connectionId;
        }
        
        // Store all query parameters in the WebSocket's attachment to persist across hibernation
        if (server.serializeAttachment) {
            server.serializeAttachment({
                connectionId,
                queryParams
            });
        }
        
        this.connections.set(connectionId, server);
        this.context?.acceptWebSocket(server);

        return { client, server };
    }
}
