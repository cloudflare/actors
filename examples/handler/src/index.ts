import { Actor, ActorConfiguration, Entrypoint, handler } from '../../../packages/core/src'


// --------------------------------------------------
// Example Entrypoint as an entrypoint to the handler
// --------------------------------------------------
export class MyWorker extends Entrypoint<Env> {
    async fetch(request: Request): Promise<Response> {
        return new Response('Hello, World!');
    }
}
// export default handler(MyWorker);

// ----------------------------------------------
// Example Actor as an entrypoint to the handler
// ----------------------------------------------
export class MyActor extends Actor<Env> {
    static configuration(request: Request): ActorConfiguration {
        return {
            studio: {
                enabled: true,
                password: 'secret'
            }
        }
    }

    async fetch(request: Request): Promise<Response> {
        return new Response(`Hello, World!`);
    }
}
// export default handler(MyActor);

// -----------------------------------------------------
// Example response without explicitly defining a Worker
// -----------------------------------------------------
export default handler(async (request: Request) => {
    return new Response('Hello, World!')
}, { 
    registry: { 
        'MyActor': MyActor 
    },
    studio: {
        enabled: true,
        path: '/brayden'
    }
});