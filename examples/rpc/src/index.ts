import { Actor, handler, fetchActor, Worker } from '../../../packages/core/src'

// TODO LIST:
// [ ] Store self identifier in storage (if storage exists, or if alarm exists)
// [ ] Right now identifiers are only stored if go through `handler` not if called from another

// Example worker with RPC call into actor
export class MyWorker extends Worker<Env> {
    async fetch(request: Request): Promise<Response> {
        return fetchActor(request, MyActor2);
    }
}

// Example actor with RPC calling into another actor
export class MyActor extends Actor<Env> {
    async fetch(request: Request): Promise<Response> {
        const actor = MyActor2.get('default') as unknown as MyActor2;
        const result = await actor.add(1, 2);
        return new Response(`Result: ${result}`);
    }
}

// Example actor with database querying
export class MyActor2 extends Actor<Env> {
    async fetch(request: Request): Promise<Response> {
        // Example using the `Storage` class built into `Actor`
        // Idea of how you get basic functionality "out of the box".
        const query = await this.storage.query(`SELECT 1 + 2;`);

        // Alarm
        this.alarms.schedule(10, 'add', [1, 2]);
        // await this.ctx.storage.setAlarm(10000);

        return new Response(`Actor Query: ${JSON.stringify(query)}`)
    }

    public async add(a: number, b: number): Promise<number> {
        console.log('Alarm... Adding: ', a, b);
        return a + b;
    }
}

// You can tell your incoming request to route to your Worker
// export default handler(MyWorker); 

// Try to skip the Worker and go direct to an Actor
export default handler(MyActor, { 
    studio: {
        enabled: true,
        secretStoreBinding: 'ActorStudioSecret',
        excludeActors: ["MyActor2"]
    },
    track: {
        enabled: true
    }
}); 

// export default handler(MyActor2); 

// Also try returning a response without a Worker or an Actor
// export default handler((request: Request) => {
//     return new Response('Lone Wolf')
// })
