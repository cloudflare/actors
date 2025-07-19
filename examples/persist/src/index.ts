import { Actor, handler, Persist } from '../../../packages/core/src'

// -------------------------------------------------
// Example Actor with RPC calling into another Actor
// -------------------------------------------------
export class MyPersistActor extends Actor<Env> {
    @Persist
    public myCustomNumber: number = 0;
    
    @Persist
    public myCustomObject: Record<string, any> = {
        customKey: {
            customDeepKey: "customDeepValue"
        }
    };

    protected override async onInit(): Promise<void> {
        // Because we have `@Persist` on our property, the value will be automatically loaded
        // before this method is called. The `init()` method is called from our constructor so
        // you could use this as a replacement to `constructor`.
        console.log('Previous value: ', this.myCustomNumber);
        console.log('Previous object: ', JSON.stringify(this.myCustomObject));
    }

    async fetch(request: Request): Promise<Response> {
        const result = Math.floor(Math.random() * 100);
        
        // Update the simple property
        this.myCustomNumber = result;
        
        // Update the nested property - this should work automatically
        this.myCustomObject.customKey.customDeepKey = `new value ${result}`;
        
        return new Response(`Current value: ${result} Current object: ${JSON.stringify(this.myCustomObject)}`);
    }

    protected onPersist(key: string, value: any) {
        console.log('Persisting property: ', key, value);
    }
}

export default handler(MyPersistActor);
