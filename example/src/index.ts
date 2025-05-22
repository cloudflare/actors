import { Actor, handler, fetchActor, Worker, ActorState, getActor } from '../../packages/core/src'

// Worker extend WorkerEntrypoint           <-- DONE
// Binding to a DO from another Worker
// What does this look like with RPC        <-- DONE
// What do websockets look like
// Remove executeTransaction                <-- DONE

// 1 - The entrypoint starts here..
export default class MyWorker extends Worker<Env> {
    async fetch(request: Request): Promise<Response> {
        // return new Response('Worker')
        
        const actor2 = MyActor2.get('default');
        const total = await actor2?.customTestFunc(400, 200);

        return new Response(`Worker Count: ${total}`)
        // return fetchActor(request, MyActor)
    }
}

// 2 - Which then calls this first Actor..
export class MyActor extends Actor<Env> {
    constructor(state: ActorState, env: Env) {
        super(state, env);
    }

    async fetch(request: Request): Promise<Response> {
        // return new Response('Actor')
        return fetchActor(request, MyActor2)
    }
}

// 3 - Which can also call into this next Actor...
export class MyActor2 extends Actor<Env> {
    static idFromRequest(request: Request): string {
        // Path should follow the pattern `/user/:id` and we should use the correct Actor instance
        const url = new URL(request.url);
        const pathParts = url.pathname.split('/');
        return pathParts.length === 3 ? pathParts[2] : "default";
    }

    constructor(state: ActorState, env: Env) {
        super(state, env);
    }

    async fetch(request: Request): Promise<Response> {
        const result = await this.database.executeQuery({ sql: 'SELECT 4+5;', isRaw: true })
        return new Response(`Actor ${MyActor2.idFromRequest(request)} - ${JSON.stringify(result)}`);
    }

    public customTestFunc(a: number, b: number): number {
        return a + b;
    }
}

// You can tell your incoming request to route to your Worker
// export default handler(MyWorker); 

// Try to skip the Worker and go direct to the Actor
// export default handler(MyActor); 
// export default handler(MyActor2); 

// Also try returning a response without a Worker or an Actor
// export default handler((request: Request) => {
//     return new Response('Lone Wolf')
// })
