import { Actor, ActorConfiguration, Entrypoint, handler } from '../../../packages/core/src'

// -----------------------------------------------------
// Example response without explicitly defining a Worker
// -----------------------------------------------------
export default handler(async (request: Request) => {
    return new Response('Hello, World!')
});


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
    async fetch(request: Request): Promise<Response> {
        return new Response(`Hello, World!`);
    }
}
// export default handler(MyActor);