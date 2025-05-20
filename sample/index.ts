import { DurableObjectState, DurableObjectNamespace, ExecutionContext } from "@cloudflare/workers-types";
import { Actor, AutoWorker, handler, fetchActor, Worker } from '../packages/core/src'

interface Env {
    MY_DURABLE_OBJECT: DurableObjectNamespace;
}


// Worker class implementation
export class MyWorker extends Worker<Env> {
    state = '';

    constructor() {
        super();
        this.state = 'Construction'
    }

    fetch(request: Request): Promise<Response> {
        // return Promise.resolve(new Response(`${this.state} Worker`));
        return fetchActor(this.env.MY_DURABLE_OBJECT, request, MyActor)
    }
}


// Actor class implementation
// - Can we make the `constructor(..)` have only custom params inside it
export class MyActor extends Actor<Env> {
    static namespace(request: Request): string {
        return "Hollywood"
    }

    // Can `Actor` constructor ever support custom attributes instead of `ctx` and `env`?
    constructor(ctx: DurableObjectState, env: Env) {
        super(ctx, env);
    }

    async fetch(request: Request): Promise<Response> {
        return new Response(`${MyActor.namespace!(request)} Actor`);
    }
}

// export default handler((request: Request) => {
//     return new Response('Lone Wolf')
// })
export default handler(MyWorker); 
// export default handler(MyActor); 