import { DurableObject, WorkerEntrypoint } from "cloudflare:workers";
import { BrowsableHandler } from "./utils/browsable";
import { env } from "cloudflare:workers";

/**
 * Alias type for DurableObjectState to match the adopted Actor nomenclature.
 * This type represents the state of a Durable Object in Cloudflare Workers.
 */
export type ActorState = DurableObjectState;

/**
 * Base abstract class for Workers that provides common functionality and structure.
 * @template T - The type of the environment object that will be available to the worker
 */
export abstract class Worker<T> extends WorkerEntrypoint {
    protected env!: T;
    protected ctx!: ExecutionContext;
    abstract fetch(request: Request): Promise<Response>;
}

/**
 * Extended Actor class that provides additional functionality for Durable Objects.
 * This class adds SQL storage capabilities and browsing functionality to the base DurableObject.
 * @template E - The type of the environment object that will be available to the actor
 */
export abstract class Actor<E> extends DurableObject<E> {
    public database: BrowsableHandler;

    public __studio(_: any) {
        return this.database.__studio(_);
    }

    /**
     * Static method to extract an ID from a request URL. Default response is the pathname
     * from the incoming URL.
     * @param request - The incoming request
     * @returns The pathname from the request URL as the ID
     */
    static idFromName = (request: Request): string => {
        return new URL(request.url).pathname;
    };

    /**
     * Static method to get an actor instance by ID
     * @param id - The ID of the actor to get
     * @returns The actor instance
     */
    static get<T extends Actor<any>>(this: new (state: ActorState, env: any) => T, id: string): DurableObjectStub<T> | undefined {
        return getActor(this, id);
    }

    /**
     * Creates a new instance of Actor.
     * @param ctx - The DurableObjectState for this actor
     * @param env - The environment object containing bindings and configuration
     */
    constructor(ctx?: ActorState, env?: E) {
        if (ctx && env) {
            super(ctx, env);
            this.database = new BrowsableHandler(ctx.storage);
        } else {
            // @ts-ignore - This is handled internally by the framework
            super();
            this.database = new BrowsableHandler(undefined);
        }
    }

    /**
     * Abstract method that must be implemented by derived classes to handle incoming requests.
     * @param request - The incoming request to handle
     * @returns A Promise that resolves to a Response
     */
    async fetch(request: Request): Promise<Response> {
        throw new Error('fetch() must be implemented in derived class');
    }
}

/**
 * Type definition for a request handler function.
 * @template E - The type of the environment object
 */
type RequestHandler<E> = (request: Request, env?: E, ctx?: ExecutionContext) => Promise<Response> | Response;

/**
 * Union type for possible handler inputs.
 * Can be either a class constructor or a request handler function.
 * @template E - The type of the environment object
 */
type HandlerInput<E> = 
    | { new(ctx: ExecutionContext, env: E): { fetch(request: Request): Promise<Response> } } // Worker
    | { new(state: DurableObjectState, env: E): DurableObject<E> } // Actor
    | RequestHandler<E>; // Empty callback

/**
 * Creates a handler for a Worker or Actor.
 * This function can handle both class-based and function-based handlers.
 * @template E - The type of the environment object
 * @param input - The handler input (class or function)
 * @returns An ExportedHandler that can be used as a Worker
 */
export function handler<E>(input: HandlerInput<E>) {
    // Create a common function to check for /__studio path
    const handleStudioPath = async (request: Request, env: E): Promise<Promise<Response> | null> => {
        const url = new URL(request.url);
        if (url.pathname === '/__studio') {
            // Verify that the request originates from dash.cloudflare.com
            const referer = request.headers.get('Referer');
            const origin = request.headers.get('Origin');
            
            // Check if the request is from dash.cloudflare.com
            // Not sold on this approach yet, easy to spoof.
            // const isFromCloudflare = 
            //     (referer && new URL(referer).hostname === 'dash.cloudflare.com') || 
            //     (origin && new URL(origin).hostname === 'dash.cloudflare.com');
                
            // if (!isFromCloudflare) {
            //     return Promise.resolve(new Response('Unauthorized', { status: 403 }));
            // }

            // Only accept POST requests
            if (request.method !== 'POST') {
                return Promise.resolve(new Response('Method not allowed', { status: 405 }));
            }
            
            // Extract payload from request body
            let payload: { class: string; id: string; statement: string; };
            try {
                const jsonData = await request.json() as Record<string, unknown>;
                
                // Validate required fields
                if (!jsonData.class || !jsonData.id || !jsonData.statement || 
                    typeof jsonData.class !== 'string' || 
                    typeof jsonData.id !== 'string' || 
                    typeof jsonData.statement !== 'string') {
                    return Promise.resolve(new Response('Missing required fields: class, id, or statement', { 
                        status: 400,
                        headers: { 'Content-Type': 'application/json' }
                    }));
                }
                
                payload = {
                    class: jsonData.class,
                    id: jsonData.id,
                    statement: jsonData.statement
                };
            } catch (error) {
                return Promise.resolve(new Response('Invalid JSON payload', { 
                    status: 400,
                    headers: { 'Content-Type': 'application/json' }
                }));
            }
            
            // Check if the class exists in the environment
            if (!(payload.class in (env as Record<string, unknown>))) {
                return Promise.resolve(new Response(`Class '${payload.class}' not found in environment`, { 
                    status: 404,
                    headers: { 'Content-Type': 'application/json' }
                }));
            }
            
            let result;
            try {
                const stubId = (env as Record<string, DurableObjectNamespace>)[payload.class].idFromName(payload.id);
                const stub = (env as Record<string, DurableObjectNamespace>)[payload.class].get(stubId) as unknown as Actor<E>;
                result = await stub.__studio({ type: 'query', statement: payload.statement });
            } catch (error) {
                return Promise.resolve(new Response(`Error executing studio command: ${error instanceof Error ? error.message : String(error)}`, {
                    status: 500,
                    headers: { 'Content-Type': 'application/json' }
                }));
            }
            
            return Promise.resolve(new Response(JSON.stringify(result), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            }));
        }
        return null;
    };

    // If input is a plain function (not a class), wrap it in a simple handler
    if (typeof input === 'function' && !input.prototype) {
        return {
            async fetch(request: Request, env: E, ctx: ExecutionContext): Promise<Response> {
                // Check for /__studio path first
                const studioResponse = await handleStudioPath(request, env);
                if (studioResponse) return studioResponse;
                
                // Proceed with normal execution
                const handler = input as RequestHandler<E>;
                const result = await handler(request, env, ctx);
                return result;
            }
        };
    }

    // Handle existing Worker and DurableObject cases
    const ObjectClass = input as (new () => any);

    // Check if it's a Worker (has a no-arg constructor)
    if (ObjectClass && ObjectClass.prototype instanceof Worker) {
        return {
            async fetch(request: Request, env: E, ctx: ExecutionContext): Promise<Response> {
                // Check for /__studio path first
                const studioResponse = await handleStudioPath(request, env);
                if (studioResponse) return studioResponse;

                // Proceed with normal execution
                const instance = new (ObjectClass as new(ctx: ExecutionContext, env: E) => any)(ctx, env);
                return instance.fetch(request);
            }
        };
    }

    // For Actor classes, automatically create the worker if Actor is being used as an entrypoint
    if (ObjectClass.prototype instanceof Actor) {
        const worker = {
            async fetch(request: Request, env: E, ctx: ExecutionContext): Promise<Response> {
                // Check for /__studio path first
                const studioResponse = await handleStudioPath(request, env);
                if (studioResponse) return studioResponse;
                
                try {
                    // Find the namespace that matches this class's name
                    const className = ObjectClass.name;
                    const envObj = env as Record<string, DurableObjectNamespace>;
                    
                    // Find the binding that matches this class name
                    const bindingName = Object.keys(envObj).find(key => {
                        const binding = (env as any).__DURABLE_OBJECT_BINDINGS?.[key];
                        return key === className || binding?.class_name === className;
                    });

                    if (!bindingName) {
                        return new Response(
                            `No DurableObject binding found for class ${className}. Make sure it's defined in wrangler.jsonc`,
                            { status: 404 }
                        );
                    }

                    const namespace = envObj[bindingName];
                    const idString = (ObjectClass as any).idFromName(request);
                    const id = namespace.idFromName(idString);
                    const stub = namespace.get(id);
                    return stub.fetch(request);
                } catch (error) {
                    return new Response(
                        `Error handling request: ${error instanceof Error ? error.message : 'Unknown error'}`,
                        { status: 500 }
                    );
                }
            }
        };
        
        return worker;
    }

    // If no class provided or it's not an Actor, return a more informative error
    return {
        async fetch(request: Request): Promise<Response> {
            return new Response(
                "Invalid handler configuration. Please provide a valid Worker, Actor, or request handler function.",
                { status: 400 }
            );
        }
    };
}

/**
 * Utility function to fetch an Actor instance and handle a request.
 * This is a convenience method for making requests to Durable Objects.
 * @template T - The type of the Actor class
 * @param request - The request to handle
 * @param ActorClass - The class constructor for the Actor
 * @returns A Promise that resolves to a Response
 */
export async function fetchActor<T extends Actor<any>>(
    request: Request,
    ActorClass: new (state: ActorState, env: any) => T
): Promise<Response> {
    try {
        const className = ActorClass.name;
        const idString = (ActorClass as any).idFromName?.(request) ?? Actor.idFromName(request);
        const stub = getActor(ActorClass, idString);

        if (!stub) {
            return new Response(
                `No DurableObject binding found for class ${className}. Make sure it's defined in wrangler.jsonc`,
                { status: 404 }
            );
        }

        return stub.fetch(request);
    } catch (error) {
        return new Response(
            `Error fetching actor: ${error instanceof Error ? error.message : 'Unknown error'}`,
            { status: 500 }
        );
    }
}

export function getActor<T extends Actor<any>>(
    ActorClass: new (state: ActorState, env: any) => T,
    id: string
): DurableObjectStub<T> | undefined {
    const className = ActorClass.name;
    const envObj = env as Record<string, DurableObjectNamespace>;
    
    const bindingName = Object.keys(envObj).find(key => {
        const binding = (env as any).__DURABLE_OBJECT_BINDINGS?.[key];
        return key === className || binding?.class_name === className;
    });

    if (!bindingName) return undefined;

    const namespace = envObj[bindingName];
    const stubId = namespace.idFromName(id);
    return namespace.get(stubId) as DurableObjectStub<T>;
}
