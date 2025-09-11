import { Actor, Entrypoint, handler } from '../../../packages/core/src'

/**
 * -------------------
 * Examples in action:
 * -------------------
 * - Track instances by unique identifier
 * - View all instances and their last accessed date time
 * - Delete instances by identifier
 */

export class MyActor extends Actor<Env> {
    // Visit https://localhost:5173/?user_id=123 to trigger this Actor and use
    // the `user_id` query parameter to define the unique identifier of the Actor.
    // This value will be what is tracked in the tracking instance.
    static async nameFromRequest(request: Request): Promise<string | undefined> {
        const url = new URL(request.url);
        const userId = url.searchParams.get('user_id');
        return `instance-${userId}`;
    }

    async fetch(request: Request): Promise<Response> {
        // If you do not enable tracking from the handler, you can manually handle the
        // track event by calling the `track` method as seen below.
        // this.track("123"); // <---- Manual tracking

        // Delete the instance by identifier
        this.deleteInstanceExample('123');

        const name = await MyActor.nameFromRequest(request);
        return new Response(`Hello, World! (${name})`);
    }

    deleteInstanceExample(identifier: string) {
        const actor = MyActor.get(identifier);

        // It can be as simple as this, but won't force eviction of the instance immediately.
        // actor.destroy(); <--- Easy mode

        // This will force eviction of the instance immediately. Since evicting an instance
        // will throw an exception, we wrap it in a try/catch.
        try {
            actor.destroy({
                forceEviction: true
            })
        } catch (e) { }
    }
}

// Supplying the `track` option will automatically track the instances for
// this Actor class which will store every unique instance name that has been
// created and the last time it was accessed.
export default handler(MyActor, {
    track: {
        enabled: true
    }
})


/**
 * The Entrypoint class below can be used to query the instance names of the Actor
 * that have been tracked by the Actor defined above.
 */
export class MyInstancesNamesEntrypoint extends Entrypoint<Env> {
    async fetch(request: Request): Promise<Response> {
        const trackerActor = MyActor.get('_cf_actors');
        const query = await trackerActor.sql`SELECT * FROM actors;`
        return new Response(JSON.stringify(query), { headers: { 'Content-Type': 'application/json' } })
    }
}

// Uncomment this line below to test the Entrypoint that returns with the list of instance names used.
// export default handler(MyInstancesNamesEntrypoint);
