import { DurableObject } from "cloudflare:workers";
import { AutoWorker } from "./utils/autoworker";
import { BrowsableHandler } from "./utils/browsable";

export type ActorState = DurableObjectState

abstract class Worker<T> {
    protected env!: T;
    protected ctx!: ExecutionContext;
    
    abstract fetch(request: Request): Promise<Response>;
}

// Extend Actor to handle initialization
export abstract class ExtendedActor<E> extends DurableObject<E> {
    protected sql!: SqlStorage;
    public database: BrowsableHandler;
    declare public ctx: DurableObjectState;
    declare public env: E;

    static idFromRequest = (request: Request): string => {
        return new URL(request.url).pathname;
    };

    constructor(ctx?: ActorState, env?: E) {
        if (ctx && env) {
            super(ctx, env);
            this.sql = ctx.storage.sql;
            this.ctx = ctx;
            this.env = env;
            this.database = new BrowsableHandler(this.sql);
        } else {
            // @ts-ignore - This is handled internally by the framework
            super();
            this.database = new BrowsableHandler(this.sql);
        }
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

type HandlerInput<E> = 
    | { new(): { fetch(request: Request, ctx: ExecutionContext, env: E): Promise<Response> } }
    | { new(state: DurableObjectState, env: E): DurableObject<E> }
    | RequestHandler<E>;

export function handler<E>(input: HandlerInput<E>) {
    // If input is a plain function (not a class), wrap it in a simple handler
    if (typeof input === 'function' && !input.prototype) {
        return {
            async fetch(request: Request, env: E, ctx: ExecutionContext): Promise<Response> {
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
                // Find the namespace that matches this class's name
                const className = ObjectClass.name;
                const envObj = env as Record<string, DurableObjectNamespace>;
                
                // Find the binding that matches this class name
                const bindingName = Object.keys(envObj).find(key => {
                    // Check both direct binding and __DURABLE_OBJECT_BINDINGS
                    const directBinding = envObj[key];
                    const binding = (env as any).__DURABLE_OBJECT_BINDINGS?.[key];
                    // Match on either the direct binding name or the class_name in __DURABLE_OBJECT_BINDINGS
                    return key === className || binding?.class_name === className;
                });

                if (!bindingName) {
                    throw new Error(`No DurableObject binding found for class ${className}. Make sure it's defined in wrangler.jsonc`);
                }

                const namespace = envObj[bindingName];
                const idString = (ObjectClass as any).idFromRequest(request);
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

// Keep entrypoint as an alias for backward compatibility
export const entrypoint = handler;

export { ExtendedActor as Actor, Worker, AutoWorker };

export function fetchActor<T>(
    namespace: DurableObjectNamespace,
    request: Request,
    ActorClass: T
): Promise<Response> {
    const idString = (ActorClass as any).idFromRequest?.(request) ?? ExtendedActor.idFromRequest(request);
    const stubId = namespace.idFromName(idString);
    const stub = namespace.get(stubId);
    return stub.fetch(request);
}
