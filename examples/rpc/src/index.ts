import { Actor, handler, fetchActor, Worker } from '../../../packages/core/src'

// [ ] Take `core` folder away, put it at root
// [X] Add `storage` folder for storage functions (Browsable)
// [ ] Add `alarms` folder for alarms functions
// [ ] Store self identifier in storage (if storage exists, or if alarm exists)
// [ ] Right now identifiers are only stored if go through `handler` not if called from another
// [X] Can we have a handler option for `_cf_index` or something that tracks all idFromName values used to easily view?
// [X] Actors should use `Storage` instead of `BrowsableHandler`
// [X] `Storage` should be usable outside of actors

// Example worker with RPC call into actor
export class MyWorker extends Worker<Env> {
    async fetch(request: Request): Promise<Response> {
        return fetchActor(request, MyActor);
    }
}

export class MyActor extends Actor<Env> {
    async fetch(request: Request): Promise<Response> {
        return new Response(`Hello, World!`)
    }
}


// Example actor with RPC function
export class MyActor3 extends Actor<Env> {
    static nameFromRequest(request: Request): string {
        // Path should follow the pattern `/user/:id` and we should use the correct Actor instance
        const url = new URL(request.url);
        const pathParts = url.pathname.split('/');
        return pathParts.length === 3 ? pathParts[2] : "default";
    }

    async fetch(request: Request): Promise<Response> {
        // const test = await this.storage?.query('SELECT 1+3;');
        // return new Response(`Actor ${this.identifier} = ${JSON.stringify(test2)}`)

        // const actor = MyActor2.get('default') as unknown as MyActor2;
        const test = await this?.storage?.query('SELECT 1+2;');
        // const test = await actor?.__studio({ type: 'query', id: 'default', statement: 'SELECT 1+1;' });


        // const total = await actor?.add(400, 200);
        // const query = await actor?.storage.query(`SELECT 1+1;`);

        return new Response(`Actor ${this.identifier} = ${JSON.stringify(test)}`)
        // return new Response(`MyActor query = ${JSON.stringify(query)}`)
        // return new Response(`Actor Count: ${total} - ${MyActor.idFromName(request)}`)
    }
}

// Example actor with database querying
export class MyActor2 extends Actor<Env> {
    async fetch(request: Request): Promise<Response> {
        const query = await this.storage.query(`SELECT 1+2;`);
        return new Response(`Actor Query: ${JSON.stringify(query)}`)
    }

    public async add(a: number, b: number): Promise<number> {
        return a + b;
    }
}

// You can tell your incoming request to route to your Worker
// export default handler(MyWorker); 

// Try to skip the Worker and go direct to an Actor
export default handler(MyActor, { 
    studio: {
        enabled: true,
        password: 'password',
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
