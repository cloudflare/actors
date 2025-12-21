declare module "cloudflare:test" {
	export interface ProvidedEnv {}

	/**
	 * Access to environment variables and bindings
	 */
	export const env: any;

	/**
	 * Lists all Durable Object IDs for a given namespace
	 */
	export function listDurableObjectIds(namespace: any): Promise<any[]>;

	/**
	 * Run code within a Durable Object instance
	 */
	export function runInDurableObject<T>(
		stub: any,
		callback: (instance: any, state: any) => Promise<T>
	): Promise<T>;
}
