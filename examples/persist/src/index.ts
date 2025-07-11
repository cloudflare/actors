import { Actor, handler, Persist } from '../../../packages/core/src'

// -------------------------------------------------
// Example Actor with RPC calling into another Actor
// -------------------------------------------------
export class MyPersistActor extends Actor<Env> {
    @Persist
    public myCustomNumber: number = 0;

    protected override async init(): Promise<void> {
        // Because we have `@Persist` on our property, the value will be automatically loaded
        // before this method is called. The `init()` method is called from our constructor so
        // you could use this as a replacement to `constructor`.
        console.log('myCustomNumber = ', this.myCustomNumber);
    }

    async fetch(request: Request): Promise<Response> {
        const result = 100;
        this.myCustomNumber = result;
        return new Response(`myCustomNumber = ${result}`);
    }
}

export default handler(MyPersistActor);
