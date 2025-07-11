import { Actor, ActorConfiguration, handler } from '../../../packages/core/src'

export class MyActor extends Actor<Env> {
    static configuration(request: Request): ActorConfiguration {
        return { locationHint: "apac" };
    }

    async fetch(request: Request): Promise<Response> {
        return new Response(`Hello, World!`);
    }
}

export default handler(MyActor);
