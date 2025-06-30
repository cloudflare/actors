import { DurableObject } from "cloudflare:workers"
import { Actor, handler, Worker, ActorState } from '../../../packages/core/src'
import { Storage } from '../../../packages/storage/src'
import { Alarms } from "../../../packages/alarms/src";

/**
 * ------------
 * How to test:
 * ------------
 * - Run `npm run cf-typegen && npm install` at the root level of the actor repo
 * - Uncomment any of the examples below and run `npm run dev` inside the `examples/playground` folder
 * - Visit https://localhost:5173 to trigger this file
 * 
 * -------------
 * How it works:
 * -------------
 * - Uncomment only ONE `export default handler(...)` at a time to test the various examples out
 * - `handler` acts to define which primitive should be the entrypoint (Worker, Actor, or Request)
 * - When using `handler` everything that isn't a Worker gets invisibly wrapped in a Worker for you
 * - You can extend either `Worker` or `Actor` and your code becomes stateless or stateful
 * - Actor is opinionated in the fact that it requires `class_name` and `name` to match in your wrangler.jsonc
 * - Actor comes with helper property classes such as `.storage` and `.alarms` to trigger helpful functions
 * - In an Actor class you can execute SQL simply by using backticks – "this.sql`SELECT 1;`;"
 * - You can manually apply migrations by running `this.storage.runMigrations()`
 * - `nameFromRequest` lets you define the Actor identifier within the class definition rather than outside
 */


// -----------------------------------------------------
// Example response without explicitly defining a Worker
// -----------------------------------------------------
// export default handler((request: Request) => {
//     return new Response('Hello, World!')
// });


// -------------------------------------------------
// Example Worker that forwards requests to an Actor
// -------------------------------------------------
export class MyWorker extends Worker<Env> {
    async fetch(request: Request): Promise<Response> {
        const actor = MyRPCActor.get('default');
        return (await actor?.fetch(request)) ?? new Response('Not found', { status: 404 });
    }
}
// export default handler(MyWorker);


// ---------------------------------------------
// Example Worker with RPC calling into an Actor
// ---------------------------------------------
export class MyRPCWorker extends Worker<Env> {
    async fetch(request: Request): Promise<Response> {
        const actor = MyStorageActor.get('default');
        const result = await actor.add(2, 3);
        return new Response(`Answer = ${result}`);
    }
}
// export default handler(MyRPCWorker);


// -----------------------------------------------------
// Example Worker polling used instance names from Actor
// -----------------------------------------------------
export class MyInstancesNamesWorker extends Worker<Env> {
    async fetch(request: Request): Promise<Response> {
        // For this to work, you must deploy and run the `MyStorageActor` from
        // the new `handler(...)` method with `track: { enabled: true }`. Those
        // instance names are stored in another instance with a default name of
        // `_cf_actors`.
        const trackerActor = MyStorageActor.get('_cf_actors');
        const query = await trackerActor.sql`SELECT * FROM actors;`
        return new Response(JSON.stringify(query), { headers: { 'Content-Type': 'application/json' } })
    }
}
export default handler(MyInstancesNamesWorker);


// ---------------------------------------------------
// Example Worker deleting single instance of an Actor
// ---------------------------------------------------
export class MyDeleteInstanceWorker extends Worker<Env> {
    async fetch(request: Request): Promise<Response> {
        // Deleting a specific instance inside our tracking instance
        const actor = MyStorageActor.get('foobar');
        await actor.destroy({ trackingInstance: '_cf_actors' });
        return new Response('Actor deleted');
    }
}
// export default handler(MyDeleteInstanceWorker);


// -------------------------------------------------
// Example Actor with RPC calling into another Actor
// -------------------------------------------------
export class MyRPCActor extends Actor<Env> {
    async fetch(request: Request): Promise<Response> {
        const actor = MyStorageActor.get('default');
        const result = await actor.add(3, 4);
        return new Response(`Answer = ${result}`);
    }
}
// export default handler(MyRPCActor);


// -----------------------------------------------
// Example Actor with storage package interactions
// -----------------------------------------------
export class MyStorageActor extends Actor<Env> {
    // Defined a custom name within the Actor to reference the Actor instance
    static nameFromRequest(request: Request) {
        return "foobar"
    }

    constructor(ctx?: ActorState, env?: Env) {
        super(ctx, env);

        // Set migrations for the SQLite database
        this.storage.migrations = [{
            idMonotonicInc: 1,
            description: "First migration",
            sql: "CREATE TABLE IF NOT EXISTS test (id INTEGER PRIMARY KEY)"
        }, {
            idMonotonicInc: 2,
            description: "Second migration",
            sql: "CREATE TABLE IF NOT EXISTS test2 (id INTEGER PRIMARY KEY)"
        }];
    }

    // Called from RPC in another Worker or Actor
    public async add(a: number, b: number): Promise<number> {
        return a + b;
    }

    async fetch(request: Request): Promise<Response> {
        // Run migrations before executing our query
        await this.storage.runMigrations();

        // Now we can proceed with querying
        const limit = await this.add(5, 5);
        const query = this.sql`SELECT * FROM sqlite_master LIMIT ${limit};`
        return new Response(`Identifier (${this.identifier} – ${this.ctx.id.toString()}) = ${JSON.stringify(query)}`)
    }
}
// export default handler(MyStorageActor, {
//     track: {
//         enabled: true
//     }
// })


// ----------------------------------------------
// Example Actor with alarm package interactions
// ----------------------------------------------
export class MyAlarmActor extends Actor<Env> {
    async fetch(request: Request): Promise<Response> {
        // Schedule an alarm to trigger in 10 seconds adding two values and a description
        this.alarms.schedule(10, 'addFromAlarm', [1, 2, 'Adding 1 + 2']);
        return new Response('Alarm set')
    }

    // Called from our alarm defined above
    public async addFromAlarm(a: number, b: number, desc: string): Promise<number> {
        console.log(`Alarm triggered, you can view this alarm in your Worker logs: ${a} + ${b} (desc: ${desc})`);
        return a + b;
    }
}
// export default handler(MyAlarmActor);


// -----------------------------------------------------------
// Example Durable Object using the Storage & Alarms classes
// -----------------------------------------------------------
// This is how you would use classes *without* the Actor class
// -----------------------------------------------------------
export class MyDurableObject extends DurableObject<Env> {
    storage: Storage;
    alarms: Alarms<this>;
    
    constructor(ctx: DurableObjectState, env: Env) {
        super(ctx, env)
        this.storage = new Storage(ctx.storage);
        this.alarms = new Alarms(ctx, this);
    }

    async fetch(request: Request): Promise<Response> {
        this.alarms.schedule(10, "addFromAlarm", [1, 2]);
        const query = this.storage.sql`SELECT 10;`
        return new Response(`Query Result: ${JSON.stringify(query)}`);
    }

    // This method is required to handle alarms
    alarm(alarmInfo?: any): void | Promise<void> {
        // Forward the alarm to the alarms handler
        if (this.alarms) {
            return this.alarms.alarm(alarmInfo);
        }
        return;
    }

    // Called from our alarm defined above
    public async addFromAlarm(a: number, b: number): Promise<number> {
        console.log(`Alarm triggered, you can view this alarm in your Worker logs: ${a} + ${b}`);
        return a + b;
    }
}

// export default {
//     async fetch(request: Request, env: Env, ctx: ExecutionContext) {
//         const id = env.MyDurableObject.idFromName(new URL(request.url).pathname);
//         const stub = env.MyDurableObject.get(id);
//         const response = await stub.fetch(request);

//         return response;
//     },
// };
