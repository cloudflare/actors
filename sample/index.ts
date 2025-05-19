import { DurableObjectState, DurableObjectNamespace, ExecutionContext } from "@cloudflare/workers-types";
import { Actor, AutoWorker, entrypoint, fetchActor, Worker } from '../packages/core/src'

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
        return Promise.resolve(new Response(`${this.state} Worker`));
        // return fetchActor(this.env.MY_DURABLE_OBJECT, 'default', request);
    }
}


// Actor class implementation
export class MyActor extends Actor<Env> {
    // Can `Actor` constructor ever support custom attributes instead of `ctx` and `env`?
    constructor(ctx: DurableObjectState, env: Env) {
        super(ctx, env);
    }

    async fetch(request: Request): Promise<Response> {
        return new Response(`Actor`);
    }
}

// export default entrypoint((request: Request) => {
//     return new Response('Lone Wolf')
// })
export default entrypoint(MyWorker); 
// export default entrypoint(MyActor); 