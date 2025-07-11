import { Actor, Entrypoint, handler } from '../../../packages/core/src'

export class MyWorker extends Entrypoint<Env> {
    async fetch(request: Request): Promise<Response> {
        const actor = await MyActor.get('default');
        const result = await actor.add(2, 3);
        return new Response(`Answer = ${result}`);
    }
}

export class MyActor extends Actor<Env> {
    async add(a: number, b: number): Promise<number> {
        return a + b;
    }
}

export default handler(MyWorker);