import { DurableObject } from "cloudflare:workers";
import { AutoWorker } from "./utils/autoworker";

abstract class Worker<T> {
    protected env!: T;
    protected ctx!: ExecutionContext;
    
    abstract fetch(request: Request): Promise<Response>;
}

// Extend Actor to handle initialization
export abstract class ExtendedActor<E> extends DurableObject<E> {
    protected sql: SqlStorage;
    static namespace = (request: Request): string => {
        return new URL(request.url).pathname;
    };

    constructor(ctx: DurableObjectState, env: E) {
        super(ctx, env);
        this.sql = ctx.storage.sql;
    }

    async fetch(request: Request): Promise<Response> {
        throw new Error('fetch() must be implemented in derived class');
    }
}

// Create a variable to hold the worker export
let workerExport: ExportedHandler<any> = {
    async fetch(request: Request, env: any, ctx: ExecutionContext): Promise<Response> {
        return new Response("Worker not initialized", { status: 500 });
    }
};

type RequestHandler<E> = (request: Request, env?: E, ctx?: ExecutionContext) => Promise<Response> | Response;

type EntrypointInput<E> = 
    | { new(): { fetch(request: Request, ctx: ExecutionContext, env: E): Promise<Response> } }
    | { new(state: DurableObjectState, env: E): DurableObject<E> }
    | RequestHandler<E>;

export function entrypoint<E>(input: EntrypointInput<E>) {
    // If input is a plain function (not a class), wrap it in a simple handler
    if (typeof input === 'function' && !input.prototype) {
        return {
            async fetch(request: Request, env: E, ctx: ExecutionContext): Promise<Response> {
                // Call the handler function with all parameters
                const handler = input as RequestHandler<E>;
                const result = await handler(request, env, ctx);
                return result;
            }
        };
    }

    // Handle existing Worker and DurableObject cases
    const ObjectClass = input as (new () => any);

    // Check if it's a StatelessObject (has a no-arg constructor)
    if (ObjectClass && ObjectClass.length === 0) {
        const statelessInstance = new (ObjectClass as new() => any)();
        return {
            fetch(request: Request, env: E, ctx: ExecutionContext): Promise<Response> {
                statelessInstance.env = env;
                statelessInstance.ctx = ctx;
                return statelessInstance.fetch(request);
            }
        };
    }

    // For Actor classes, automatically create the worker
    if (ObjectClass.prototype instanceof ExtendedActor) {
        const worker = {
            async fetch(request: Request, env: E, ctx: ExecutionContext): Promise<Response> {
                const namespace = Object.values(env)[0] as DurableObjectNamespace;
                const idString = (ObjectClass as any).namespace(request);
                const id = namespace.idFromName(idString);
                const stub = namespace.get(id);
                return stub.fetch(request);
            }
        };
        return worker;
    }

    // If no class provided or it's not an Actor, return workerExport
    return workerExport;
}

export { ExtendedActor as Actor, Worker, AutoWorker };

export function fetchActor<T>(
    namespace: DurableObjectNamespace,
    name: string = 'default',
    request: Request
): Promise<Response> {
    const stubId = namespace.idFromName(name);
    const stub = namespace.get(stubId);
    return stub.fetch(request);
}
