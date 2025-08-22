import { env, DurableObject, WorkerEntrypoint } from "cloudflare:workers";
import { Storage } from "../../storage/src/index";
import { Alarms } from "../../alarms/src/index";
import { Sockets } from "../../sockets/src/index";
import { Persist, PERSISTED_VALUES, initializePersistedProperties, persistProperty } from "./persist";

export { Persist };

/**
 * Alias type for DurableObjectState to match the adopted Actor nomenclature.
 * This type represents the state of a Durable Object in Cloudflare Workers.
 */
export type ActorState = DurableObjectState;

/**
 * Type definition for a constructor of an actor.
 * @template T - The type of the actor
 */
export type ActorConstructor<T extends Actor<any> = Actor<any>> = new (state: ActorState, env: any) => T;

/**
 * Configuration options for an actor.
 */
export type ActorConfiguration = {
    locationHint?: DurableObjectLocationHint;
    sockets?: {
        upgradePath?: string;
        autoResponse?: {
            ping: string;
            pong: string;
        }
    }
}

/**
 * Provide a default name value for an actor.
 */
const DEFAULT_ACTOR_NAME = "default";

/**
 * Provide a default name value for the tracking actor.
 */
const TRACKING_ACTOR_NAME = "_cf_actors";

/**
 * Base abstract class for Workers that provides common functionality and structure.
 * @template T - The type of the environment object that will be available to the worker
 */
export abstract class Entrypoint<T> extends WorkerEntrypoint {
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
    public sockets: Sockets<this>;

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
    static async nameFromRequest(request: Request): Promise<string | undefined> {
        return DEFAULT_ACTOR_NAME;
    };

    /**
     * Static method to configure the actor.
     * @param options 
     * @returns 
     */
    static configuration = (request: Request): ActorConfiguration => {
        return { 
            locationHint: undefined, 
            sockets: { 
                upgradePath: "/ws"
            }
        };
    }

    /**
     * Static method to get an actor instance by ID
     * @param id - The ID of the actor to get
     * @returns The actor instance
     */
    static get<T extends Actor<any>>(this: new (state: ActorState, env: any) => T, id: string): DurableObjectStub<T> {
        const stub = getActor(this, id);

        // This may seem repetitive from when we do this in `getActor` prior to returning the stub
        // but this allows classes to do `this.ctx.blockConcurrencyWhile` and log out the identifier
        // there. Without doing this again, that seems to fail for one reason or another.
        stub.setIdentifier(id);

        return stub;
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
            this.sockets = new Sockets(ctx, this);
            
            // Initialize the persisted values map
            (this as any)[PERSISTED_VALUES] = new Map<string, any>();
            
            // Move all initialization into blockConcurrencyWhile to ensure
            // persisted properties are loaded before any code runs
            ctx.blockConcurrencyWhile(async () => {
                // Load persisted properties
                await this._initializePersistedProperties();
                
                // Call the initialize method after persisted properties are loaded
                await this.onInit();
            });
        } else {
            // @ts-ignore - This is handled internally by the framework
            super();
            this.storage = new Storage(undefined);
            this.alarms = new Alarms(undefined, this);  
            this.sockets = new Sockets(undefined, this);  

            // Initialize the persisted values map
            (this as any)[PERSISTED_VALUES] = new Map<string, any>();
        }

        // Set a default identifier if none exists
        if (!this.identifier) {
            this.identifier = DEFAULT_ACTOR_NAME;
        }
    }
    
    /**
     * Initializes the persisted properties table and loads any stored values.
     * This is called during construction to ensure properties are loaded before any code uses them.
     * @private
     */
    private async _initializePersistedProperties(): Promise<void> {
        await initializePersistedProperties(this);
    }
    
    /**
     * Persists a property value to the Durable Object storage.
     * @param propertyKey The name of the property to persist
     * @param value The value to persist
     * @private
     */
    private async _persistProperty(propertyKey: string, value: any): Promise<void> {
        await persistProperty(this, propertyKey, value);
    }

    /**
     * Abstract method that must be implemented by derived classes to handle incoming requests.
     * @param request - The incoming request to handle
     * @returns A Promise that resolves to a Response
     */
    async fetch(request: Request): Promise<Response> {
        // If the request route is `/ws` then we should upgrade the connection to a WebSocket
        // Get configuration from the static property
        const config = (this.constructor as typeof Actor).configuration(request);
        
        // Parse the URL to check if the path component matches the upgradePath
        const url = new URL(request.url);
        const upgradePath = config?.sockets?.upgradePath ?? "/ws";
        if (url.pathname === upgradePath || url.pathname.startsWith(`${upgradePath}/`)) {
            const shouldUpgrade = this.shouldUpgradeSocket(request);
            
            // Only continue to upgrade path if shouldUpgrade returns true
            if (shouldUpgrade) {
                return Promise.resolve(this.onSocketUpgrade(request));
            }
        }

        // Autoresponse in sockets allows clients to send a ping message and receive a pong response
        // without waking the durable object up from hibernation.
        if (config?.sockets?.autoResponse) {
            this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair(config.sockets.autoResponse.ping, config.sockets.autoResponse.pong));
        }

        return this.onRequest(request);
    }

    /**
     * Lifecycle method that is called when the actor is initialized.
     * @protected
     */
    protected async onInit() {
        // Default implementation is a no-op
    }

    /**
     * Lifecycle method that is called when the actor is notified of an alarm.
     * @protected
     * @param alarmInfo - Information about the alarm that was triggered
     */
    protected async onAlarm(alarmInfo?: AlarmInvocationInfo) {
        // Default implementation is a no-op
    }

    /**
     * Hook that is called whenever a @Persist decorated property is stored in the database.
     * Override this method to listen to persistence events.
     * @param key The property key that was persisted
     * @param value The value that was persisted
     */
    protected onPersist(key: string, value: any) {
        // Default implementation is a no-op
    }

    protected onRequest(request: Request): Promise<Response> {
        return Promise.resolve(new Response("Not Found", { status: 404 }));
    }

    protected shouldUpgradeSocket(request: Request): boolean {
        // By default we do not want to assume every application needs to use sockets
        // and we do not want to upgrade every request to a socket.
        return false;
    }

    // Only need to override if you want to handle the socket upgrade yourself.
    // Otherwise this is all handled for you automatically.
    protected onSocketUpgrade(request: Request): Response {
        const client = this.sockets.acceptWebSocket(request);
        this.onSocketConnect(client, request);

        return new Response(null, {
            status: 101,
            webSocket: client,
        });
    }

    protected onSocketConnect(ws: WebSocket, request: Request) {
        // Default implementation is a no-op
    }

    protected onSocketDisconnect(ws: WebSocket) {
        // Default implementation is a no-op
    }

    protected onSocketMessage(ws: WebSocket, message: any) {
        // Default implementation is a no-op
    }

    async webSocketMessage(ws: WebSocket, message: any) {
        this.sockets.webSocketMessage(ws, message);

        // Call user defined onSocketMessage method before proceeding
        this.onSocketMessage(ws, message);
    }

    async webSocketClose(
        ws: WebSocket,
        code: number
    ) {
        // Close the WebSocket connection
        this.sockets.webSocketClose(ws, code);

        // Call user defined onSocketDisconnect method before proceeding
        this.onSocketDisconnect(ws);
    }

    async alarm(alarmInfo?: AlarmInvocationInfo): Promise<void> {
        // Call user defined onAlarm method before proceeding
        await this.onAlarm(alarmInfo);

        if (this.alarms) {
            return this.alarms.alarm(alarmInfo);
        }

        return;
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

    /**
     * Tracks the last access time of an actor instance.
     * @param idString The identifier of the actor instance to track.
     */
    async track(idString: string) {
        if (TRACKING_ACTOR_NAME === idString) {
            throw new Error(`Cannot track instance with same name as tracking instance, change value to differ from "${TRACKING_ACTOR_NAME}"`);
        }

        const trackingStub = getActor(this.constructor as ActorConstructor<Actor<E>>, TRACKING_ACTOR_NAME) as unknown as Actor<E>;
        const currentDateTime = new Date().toISOString();
        await trackingStub.__studio({ type: 'query', statement: 'CREATE TABLE IF NOT EXISTS actors (identifier TEXT PRIMARY KEY, last_accessed TEXT)' });
        await trackingStub.__studio({ type: 'query', statement: `INSERT INTO actors (identifier, last_accessed) VALUES (?, ?) ON CONFLICT(identifier) DO UPDATE SET last_accessed = ?`, params: [idString, currentDateTime, currentDateTime] });
    }

    /**
     * Destroy the Actor by removing all actor library specific tables and state
     * that is associated with the actor.
     * @param _ - Optional configuration object
     * @param _.trackingInstance - Optional tracking instance name
     * @param _.forceEviction - When true, forces eviction of the actor from the cache
     * @throws Will throw an exception when forceEviction is true
     */
    async destroy(_?: { forceEviction?: boolean }) {
        // If tracking instance is defined, delete the instance name from the tracking instance map.
        if (this.identifier) {
            try {
                const trackerActor = getActor(this.constructor as ActorConstructor<Actor<E>>, TRACKING_ACTOR_NAME) as unknown as Actor<E>;
                if (trackerActor) {
                    await trackerActor.sql`DELETE FROM actors WHERE identifier = ${this.identifier};`;
                }
            } catch (e) {
                console.error(`Failed to delete actor from tracking instance: ${e instanceof Error ? e.message : 'Unknown error'}`);
            }
        }

        // Remove all alarms & delete all the storage
        await this.ctx.storage.deleteAlarm();
        await this.ctx.storage.deleteAll();

        if (_?.forceEviction) {
            // Enforce eviction of the actor. When forceEviction is true, the actor will be destroyed
            // and the worker will be evicted from the cache. This will throw an exception.
            this.ctx.abort("destroyed");
        }
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
        // NOTE: this will use storage which will prevent your instance from every being fully removed unless clearing
        // the storage layer, or calling `.destroy()` on the actor.
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
    if (ObjectClass && ObjectClass.prototype instanceof Entrypoint) {
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
                    const idString = await (ObjectClass as any).nameFromRequest(request);

                    // If no identifier is found or returned in `nameFromRequest` method, throw an error
                    // to prevent attempting to access an instance that is invalid.
                    if (idString === undefined) {
                        return new Response(
                            JSON.stringify({ error: "Internal Server Error", message: "Invalid actor identifier" }),
                            {
                                status: 500,
                                headers: {
                                    "Content-Type": "application/json"
                                }
                            }
                        );
                    }

                    const stub = getActor(ObjectClass as ActorConstructor<Actor<E>>, idString);

                    // If tracking is enabled, track the current actor identifier in a separate durable object.
                    if (opts?.track?.enabled) {
                        try {
                            await stub.track(idString);
                        } catch (error) {
                            console.error(`Failed to track actor instance: ${error instanceof Error ? error.message : 'Unknown error'}`);
                        }
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
    ActorClass: ActorConstructor<T>,
    id: string
): DurableObjectStub<T> {
    const className = ActorClass.name;
    const envObj = env as unknown as Record<string, DurableObjectNamespace>;
    const locationHint = (ActorClass as any).configuration().locationHint;
    
    const bindingName = Object.keys(envObj).find(key => {
        const binding = (env as any).__DURABLE_OBJECT_BINDINGS?.[key];
        return key === className || binding?.class_name === className;
    });

    if (!bindingName) {
        throw new Error(`No Durable Object binding found for actor class ${className}. Check update your wrangler.jsonc to match the binding "name" and "class_name" to be the same as the class name.`);
    }

    const namespace = envObj[bindingName];
    const stubId = namespace.idFromName(id);
    const stub = namespace.get(stubId, { locationHint }) as DurableObjectStub<T>;
    
    stub.setIdentifier(id);
    return stub;
}
