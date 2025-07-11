import { Actor, handler } from '../../../packages/core/src'

export class MyActor extends Actor<Env> {
    async fetch(request: Request): Promise<Response> {
        return new Response(`Hello, World!`);
    }

    protected onInit(): Promise<void> {
        console.log('Actor is initialized');
        return Promise.resolve();
    }

    protected onDestroy(): Promise<void> {
        console.log('Actor is being destroyed');
        return Promise.resolve();
    }

    protected onAlarm(alarmInfo?: AlarmInvocationInfo): Promise<void> {
        console.log('Actor is notified of an alarm');
        return Promise.resolve();
    }
}

export default handler(MyActor);
