import { Actor, handler, fetchActor, Worker, ActorState } from '../../packages/core/src'

// Worker extend WorkerEntrypoint           <-- DONE
// Binding to a DO from another Worker
// What does this look like with RPC
// What do websockets look like
// Remote executeTransaction

// 1 - The entrypoint starts here..
export class MyWorker extends Worker<Env> {
    fetch(request: Request): Promise<Response> {
        // return new Response('Worker')
        return fetchActor(request, MyActor)
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
}

// You can tell your incoming request to route to your Worker
export default handler(MyWorker); 

// Try to skip the Worker and go direct to the Actor
// export default handler(MyActor); 
// export default handler(MyActor2); 

// Also try returning a response without a Worker or an Actor
// export default handler((request: Request) => {
//     return new Response('Lone Wolf')
// })
