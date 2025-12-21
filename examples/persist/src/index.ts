import { Actor, handler, Persist } from "../../../packages/core/src";

// -------------------------------------------------
// Example Actor with RPC calling into another Actor
// -------------------------------------------------
export class MyPersistActor extends Actor<Env> {
	@Persist
	public myCustomNumber: number = 0;

	@Persist
	public myCustomObject: Record<string, any> = {
		customKey: {
			customDeepKey: [],
		},
	};

	static async nameFromRequest(_request: Request): Promise<string | undefined> {
		// Pause for 500 milliseconds to mimic async operation
		await new Promise((resolve) => setTimeout(resolve, 500));
		return "default";
	}

	protected override async onInit(): Promise<void> {
		// Because we have `@Persist` on our property, the value will be automatically loaded
		// before this method is called. The `init()` method is called from our constructor so
		// you could use this as a replacement to `constructor`.
		console.log("Previous value: ", this.myCustomNumber);
		console.log("Previous object: ", JSON.stringify(this.myCustomObject));
	}

	async fetch(_request: Request): Promise<Response> {
		const result = Math.floor(Math.random() * 100);

		// Update the simple property
		this.myCustomNumber = result;

		// Update the nested property
		this.myCustomObject.customKey.customDeepKey.push(result);

		return new Response(
			`Current value: ${result} Current object: ${JSON.stringify(this.myCustomObject)}`
		);
	}

	protected onPersist(key: string, value: any) {
		console.log("Persisting property: ", key, value);
	}
}

export default handler(MyPersistActor);
