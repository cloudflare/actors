import { DurableObject } from "cloudflare:workers";

// Create a variable to hold the worker export
let workerExport: ExportedHandler<any> = {
    async fetch(request: Request, env: any, ctx: ExecutionContext): Promise<Response> {
        return new Response("Worker not initialized", { status: 500 });
    }
};

// Default implementation of namespace
function defaultNamespace(request: Request): string {
    return new URL(request.url).pathname;
}

// Decorator that automatically creates a Worker for the Durable Object
export function AutoWorker<E extends { [key: string]: DurableObjectNamespace }>() {
    return function <T extends { new(state: DurableObjectState, env: E): DurableObject<E> } & { namespace?: (request: Request) => string }>(target: T): T {
        // Add default namespace to the class if it doesn't exist
        if (!target.namespace) {
            target.namespace = defaultNamespace;
        }

        const worker = {
            async fetch(request: Request, env: E, ctx: ExecutionContext): Promise<Response> {
                const namespace = Object.values(env)[0] as DurableObjectNamespace;
                const idString = target.namespace!(request);
                const id = namespace.idFromName(idString);
                const stub = namespace.get(id);
                return stub.fetch(request);
            }
        };
        workerExport = worker;
        return target;
    }
}

// Export a function to get the worker instead of the worker directly
export function entrypoint<E>(
    ObjectClass: { new(): { fetch(request: Request, ctx: ExecutionContext, env: E): Promise<Response> } } | 
                 { new(state: DurableObjectState, env: E): DurableObject<E> }
) {
    // Check if it's a StatelessObject (has a no-arg constructor)
    if (ObjectClass && ObjectClass.length === 0) {
        const statelessInstance = new (ObjectClass as new() => any)();
        return {
            fetch(request: Request, env: E, ctx: ExecutionContext): Promise<Response> {
                return statelessInstance.fetch(request, ctx, env);
            }
        };
    }
    // If no class provided or it's a StatefulObject, return workerExport
    return workerExport;
}