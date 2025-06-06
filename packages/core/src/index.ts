import { env, DurableObject, WorkerEntrypoint } from "cloudflare:workers";
import { Storage } from "../../storage/src/index";
import { Alarms, Alarms2 } from "../../alarms/src/index";

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
    public identifier?: string;
    public storage: Storage;
    public alarms: Alarms<this>;

    public __studio(_: any) {
        return this.storage.__studio(_);
    }

    public setIdentifier(id: string) {
        this.identifier = id;
        
        // TODO: Action
        // If storage is being used or an alarm exists, store this identifier into a metadata
        // SQLite table for referencing later. Currently being able to self refernece an instances
        // identifier from alarms for example is not possible.
    }

    /**
     * Static method to extract an ID from a request URL. Default response is the pathname
     * from the incoming URL.
     * @param request - The incoming request
     * @returns The pathname from the request URL as the ID
     */
    static nameFromRequest = (request: Request): string => {
        return new URL(request.url).pathname;

        // TODO: Discussion
        // Or should instead the default implementation be
        // return "default"
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
            this.storage = new Storage(ctx.storage);
            this.alarms = new Alarms(ctx, this);
        } else {
            // @ts-ignore - This is handled internally by the framework
            super();
            this.storage = new Storage(undefined);
            this.alarms = new Alarms(undefined, this);
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

    /**
     * Execute SQL queries against the Agent's database
     * @template T Type of the returned rows
     * @param strings SQL query template strings
     * @param values Values to be inserted into the query
     * @returns Array of query results
     */
    sql<T = Record<string, string | number | boolean | null>>(
        strings: TemplateStringsArray,
        ...values: (string | number | boolean | null)[]
    ) {
        let query = "";
        try {
          // Construct the SQL query with placeholders
          query = strings.reduce(
            (acc, str, i) => acc + str + (i < values.length ? "?" : ""),
            ""
          );
    
          // Execute the SQL query with the provided values
          return [...this.ctx.storage.sql.exec(query, ...values)] as T[];
        } catch (e) {
          console.error(`failed to execute sql query: ${query}`, e);
          throw e;
        }
    }

    alarm(alarmInfo?: AlarmInvocationInfo): void | Promise<void> {
        if (this.alarms) {
            return this.alarms.alarm(alarmInfo);
        }

        return;
    }

    /**
     * Destroy the Actor by removing all actor library specific tables and state
     * that is associated with the actor. This operation may not succeed if you do
     * not delete all of the user defined SQL tables first. This function will
     * handle deleting tables specific to this library only.
     */
    async destroy() {
        // Drop actor library specific tables, the user will be responsible to delete
        // their own tables first otherwise this won't successfully destroy the actor.
        await this.storage.query(`DROP TABLE IF EXISTS _actor_alarms`);
    
        // Delete all alarms
        await this.ctx.storage.deleteAlarm();
        await this.ctx.storage.deleteAll();

        // Enforce eviction of the actor
        this.ctx.abort("destroyed");
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

type HandlerOptions = {
    studio?: {
        // Password for protection against unauthorized access
        password?: string;
        // Enable or disable observability
        enabled: boolean;
        // Exclude actors by their class name from Studio (e.g. "MyActor")
        excludeActors?: Array<string>
    };
    track?: {
        // Table where actor metadata is stored. Defaults to `_cf_actors` and is an independent durable object.
        trackingInstance?: string;
        // Note: this will use storage which will prevent your instance from every being fully removed
        enabled: boolean;
    }
};

/**
 * Creates a handler for a Worker or Actor.
 * This function can handle both class-based and function-based handlers.
 * @template E - The type of the environment object
 * @param input - The handler input (class or function)
 * @param opts - Optional options for integration features
 * @returns An ExportedHandler that can be used as a Worker
 */
export function handler<E>(input: HandlerInput<E>, opts?: HandlerOptions) {
    // Create a common function to check for /__studio path
    const handleStudioPath = async (request: Request, env: E): Promise<Promise<Response> | null> => {
        // If the user has not opted into Studio, then this experience should not be made reachable to the instance.
        if (!opts?.studio?.enabled) return null;

        const url = new URL(request.url);
        if (url.pathname === '/__studio') {
            // Verify that the request originates from dash.cloudflare.com
            const referer = request.headers.get('Referer');
            const origin = request.headers.get('Origin');
            const authentication = request.headers.get('X-Studio-Authentication');

            // If a Studio password value exists, then the authentication value must match to be able to
            // access the functionality.
            if (opts?.studio?.password && (!authentication || authentication !== opts.studio.password)) {
                return Promise.resolve(new Response('Unauthorized', { status: 403 }));
            }
            
            // Check if the request is from dash.cloudflare.com
            // Not sold on this approach yet, easy to spoof, but serves as another layer of protection.
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
            
            // Exclude certain actors from Studio
            if (opts?.studio?.excludeActors?.includes(payload.class)) {
                return Promise.resolve(new Response(`Actor '${payload.class}' is excluded from Studio`, { 
                    status: 403,
                    headers: { 'Content-Type': 'application/json' }
                }));
            }
            
            // Check if the actor exists in the environment
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
                    const idString = (ObjectClass as any).nameFromRequest(request);
                    const id = namespace.idFromName(idString);
                    const stub = namespace.get(id) as unknown as Actor<E>;
                    stub.setIdentifier(idString);

                    // If tracking is enabled, track the current actor identifier in a separate durable object.
                    if (opts?.track?.enabled) {
                        const trackingNamespace = envObj[bindingName];
                        const trackingIdString = (ObjectClass as any).nameFromRequest(request);
                        const trackingId = trackingNamespace.idFromName('_cf_actors');
                        const trackingStub = trackingNamespace.get(trackingId) as unknown as Actor<E>;
                        trackingStub.setIdentifier(trackingIdString);
                        
                        await trackingStub.__studio({ type: 'query', statement: 'CREATE TABLE IF NOT EXISTS actors (identifier TEXT PRIMARY KEY)' });
                        await trackingStub.__studio({ type: 'query', statement: `INSERT OR IGNORE INTO actors (identifier) VALUES ('${trackingIdString}')` });
                    }

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
        const idString = (ActorClass as any).nameFromRequest?.(request) ?? Actor.nameFromRequest(request);
        const stub = getActor(ActorClass, idString);

        if (!stub) {
            return new Response(
                `No DurableObject binding found for class ${className}. Make sure it's defined in wrangler.jsonc`,
                { status: 404 }
            );
        }

        stub.setIdentifier(idString);
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
    const envObj = env as unknown as Record<string, DurableObjectNamespace>;
    
    const bindingName = Object.keys(envObj).find(key => {
        const binding = (env as any).__DURABLE_OBJECT_BINDINGS?.[key];
        return key === className || binding?.class_name === className;
    });

    if (!bindingName) return undefined;

    const namespace = envObj[bindingName];
    const stubId = namespace.idFromName(id);
    return namespace.get(stubId) as DurableObjectStub<T>;
}
