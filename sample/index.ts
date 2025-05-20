import { DurableObjectState, DurableObjectNamespace } from "@cloudflare/workers-types";
import { Actor, AutoWorker, handler, fetchActor, Worker } from '../packages/core/src'

interface Env {
    MY_DURABLE_OBJECT: DurableObjectNamespace;
}


// Worker class implementation
// export class MyWorker extends Worker<Env> {
//     fetch(request: Request): Promise<Response> {
//         // Can we remove the first param? Maybe the second?
//         return fetchActor(this.env.MY_DURABLE_OBJECT, request, MyActor)
//     }
// }

// export default handler(MyWorker); 


// Actor class implementation
export class MyActor extends Actor<Env> {
    static idFromRequest(request: Request): string {
        return "Hollllllywood"
    }
    
    constructor(state: DurableObjectState, env: Env) {
        super(state, env);
    }

    async fetch(request: Request): Promise<Response> {
        return new Response(`${MyActor.idFromRequest(request)} Actor`);
    }
}

export default handler(MyActor); 


// Empty implementation
// export default handler((request: Request) => {
//     return new Response('Lone Wolf')
// })






    // actorDidStartup() {
    //     //
    // }

    // actorDidShutdown() {
    //     //
    // }

    // actorReceivedRequest(request: Request) {

    // }

    // actorSentResponse(response: Response) {

    // }

    // actorAlarmWillFire(alarm: Alarm) {

    // }

    // actorAlarmDidFire(alarm: Alarm) {

    // }