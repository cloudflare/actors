import { Actor, handler, Persist } from '../../../packages/core/src'

// -------------------------------------------------
// Example Actor with RPC calling into another Actor
// -------------------------------------------------
export class MyPersistActor extends Actor<Env> {
    @Persist
    public myCustomNumber: number = 0;

    protected override async onInit(): Promise<void> {
        // Because we have `@Persist` on our property, the value will be automatically loaded
        // before this method is called. The `init()` method is called from our constructor so
        // you could use this as a replacement to `constructor`.
        console.log('Previous value: ', this.myCustomNumber);
    }

    async fetch(request: Request): Promise<Response> {
        const result = Math.floor(Math.random() * 100);
        this.myCustomNumber = result;
        return new Response(`Current value: ${result}`);
    }

    protected onPersist(key: string, value: any) {
        console.log('Persisting property: ', key, value);
    }
}

export default handler(MyPersistActor);
