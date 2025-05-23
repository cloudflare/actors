import { Actor, handler, fetchActor, Worker, ActorState, getActor } from '../../packages/core/src'

// Example worker with RPC call into actor
export default class MyWorker extends Worker<Env> {
    async fetch(request: Request): Promise<Response> {
        const actor = MyActor.get('default');
        const total = await actor?.add(400, 200);
        return new Response(`Worker Count: ${total}`)
    }
}

// Example actor with RPC function
export class MyActor extends Actor<Env> {
    constructor(state: ActorState, env: Env) {
        super(state, env);
    }

    async fetch(request: Request): Promise<Response> {
        return fetchActor(request, MyActor2)
    }

    public async add(a: number, b: number): Promise<number> {
        return a + b;
    }
}

// Example actor with idFromRequest and database querying
export class MyActor2 extends Actor<Env> {
    static idFromRequest(request: Request): string {
        // Path should follow the pattern `/user/:id` and we should use the correct Actor instance
        const url = new URL(request.url);
        const pathParts = url.pathname.split('/');
        return pathParts.length === 3 ? pathParts[2] : "default";
    }

    async fetch(request: Request): Promise<Response> {
        const result = await this.database.executeQuery({ sql: 'SELECT 4+5;' })
        return new Response(`Error in Actor - ${MyActor2.idFromRequest(request)} - ${JSON.stringify(result)}`);
    }
}

// You can tell your incoming request to route to your Worker
// export default handler(MyWorker); 

// Try to skip the Worker and go direct to an Actor
// export default handler(MyActor); 
// export default handler(MyActor2); 

// Also try returning a response without a Worker or an Actor
// export default handler((request: Request) => {
//     return new Response('Lone Wolf')
// })
