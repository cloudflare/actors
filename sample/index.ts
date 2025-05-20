import { DurableObjectNamespace } from "@cloudflare/workers-types";
import { Actor, AutoWorker, handler, fetchActor, Worker, ActorState } from '../packages/core/src'

// Ideal Optimizations:
// - Remove the need for Wrangler definitions
// - Remove the need to have all defined objects from Wrangler exported in this main file
// - Remove the below Env interface


interface Env {
    MyActor: DurableObjectNamespace;
    MyActor2: DurableObjectNamespace;
}


export class MyWorker extends Worker<Env> {
    fetch(request: Request): Promise<Response> {
        return fetchActor(this.env.MyActor2, request, MyActor)
    }
}

// export default handler(MyWorker); 



export class MyActor extends Actor<Env> {
    constructor(state: ActorState, env: Env) {
        super(state, env);
    }

    async fetch(request: Request): Promise<Response> {
        return new Response(`Actor`);

        // Need to simplify to be two inputs
        // return fetchActor(this.env.MyActor2, request, MyActor2)
    }
}

// Need to support multiple Actors
export class MyActor2 extends Actor<Env> {
    constructor(state: ActorState, env: Env) {
        super(state, env);
    }

    async fetch(request: Request): Promise<Response> {
        return new Response(`Actor 22`);
    }
}

// export default handler(MyActor); 


// Actor class implementation
// export class MyActor extends Actor<Env> {
//     static idFromRequest(request: Request): string {
//         return "Hollywood"
//     }
    
//     constructor(state: DurableObjectState, env: Env) {
//         super(state, env);
//     }

//     async fetch(request: Request): Promise<Response> {
//         return new Response(`${MyActor.idFromRequest(request)} Actor`);
//     }
// }

// export default handler(MyActor); 


// Empty implementation
// export default handler((request: Request) => {
//     return new Response('Lone Wolf')
// })
