import { DurableObject } from 'cloudflare:workers';
import { Alarms } from '../../../packages/alarms/src';
import { Storage } from '../../../packages/storage/src';

/**
 * -------------------
 * Examples in action:
 * -------------------
 * - How to use library classes without extending the Actor class
 * - How to use alarms helpers for setting multiple alarms
 * - How to use storage helpers for querying the SQLite database
 */

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

export default {
    async fetch(request: Request, env: Env, ctx: ExecutionContext) {
        const id = env.MyDurableObject.idFromName(new URL(request.url).pathname);
        const stub = env.MyDurableObject.get(id);
        const response = await stub.fetch(request);

        return response;
    },
};
