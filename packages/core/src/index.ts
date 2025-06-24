import { env, DurableObject, WorkerEntrypoint } from "cloudflare:workers";
import { Storage } from "../../storage/src/index";
import { Alarms } from "../../alarms/src/index";

/**
 * Alias type for DurableObjectState to match the adopted Actor nomenclature.
 * This type represents the state of a Durable Object in Cloudflare Workers.
 */
export type ActorState = DurableObjectState;

/**
 * Provide a default name value for an actor.
 */
const DEFAULT_ACTOR_NAME = "default";

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

    /**
     * Set the identifier for the actor as named by the client
     * @param id The identifier to set
     */
    public async setIdentifier(id: string) {
        this.identifier = id;
    }

    /**
     * Static method to extract an ID from a request URL. Default response "default".
     * @param request - The incoming request
     * @returns The name string value defined by the client application to reference an instance
     */
    static nameFromRequest = (request: Request): string => {
        return DEFAULT_ACTOR_NAME;
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

        // Set a default identifier if none exists
        if (!this.identifier) {
            this.identifier = DEFAULT_ACTOR_NAME;
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
     * that is associated with the actor.
     */
    async destroy() {
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

    // Check if it's a Worker (has a no-arg constructor)
    if (ObjectClass && ObjectClass.prototype instanceof Worker) {
        return {
            async fetch(request: Request, env: E, ctx: ExecutionContext): Promise<Response> {
                const instance = new (ObjectClass as new(ctx: ExecutionContext, env: E) => any)(ctx, env);
                return instance.fetch(request);
            }
        };
    }

    // For Actor classes, automatically create the worker if Actor is being used as an entrypoint
    if (ObjectClass.prototype instanceof Actor) {
        const worker = {
            async fetch(request: Request, env: E, ctx: ExecutionContext): Promise<Response> {
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
                        
                        await trackingStub.__studio({ type: 'query', statement: 'CREATE TABLE IF NOT EXISTS actors (identifier TEXT PRIMARY KEY, last_accessed TEXT)' });
                        const currentDateTime = new Date().toISOString();
                        await trackingStub.__studio({ type: 'query', statement: `INSERT INTO actors (identifier, last_accessed) VALUES ('${trackingIdString}', '${currentDateTime}') ON CONFLICT(identifier) DO UPDATE SET last_accessed = '${currentDateTime}'` });
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
