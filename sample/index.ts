import { env } from "cloudflare:workers";
import { Actor, handler, fetchActor, Worker, ActorState } from '../packages/core/src'


// 1 - The entrypoint starts here..
export class MyWorker extends Worker<Env> {
    fetch(request: Request): Promise<Response> {
        return fetchActor(request, MyActor)
    }
}


// 2 - Which then calls this first Actor..
export class MyActor extends Actor<Env> {
    constructor(state: ActorState, env: Env) {
        super(state, env);
    }

    async fetch(request: Request): Promise<Response> {
        return fetchActor(request, MyActor2)
    }
}

// 3 - Which can also call into this next Actor...
export class MyActor2 extends Actor<Env> {
    static idFromRequest(request: Request): string {
        return "Hollywood"
    }

    constructor(state: ActorState, env: Env) {
        super(state, env);
    }

    async fetch(request: Request): Promise<Response> {
        return new Response(`${MyActor2.idFromRequest(request)} - Actor 2`);
    }
}


export default handler(MyWorker); 
// export default handler(MyActor); 
// export default handler(MyActor2); 
// export default handler((request: Request) => {
//     return new Response('Lone Wolf')
// })
