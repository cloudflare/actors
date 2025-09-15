import { Hono } from 'hono'
import { getFirstAvailableTopicShard, MAX_SHARD_COUNT, TopicActor } from './topic';

export default {
    async fetch(request: Request, env: Env, ctx: ExecutionContext) {
        const app = new Hono();

        // POST
        // { topic: "your_topic", message: "some message" }
        app.get('/publish', async (c) => {
            const payload: any = await c.req.json();
            
            for (let shardVersion = 0; shardVersion < MAX_SHARD_COUNT; shardVersion++) {
                const actor = TopicActor.get(`${payload.topic}_${shardVersion}`);
                actor.publish(payload.message)
            }
        });

        // GET
        // /subscribe?topic=your_topic
        app.get('/subscribe', async (c) => {
            const topic = c.req.query('topic');
            
            if (topic) {
                const actor = await getFirstAvailableTopicShard(topic, 0);

                if (actor === null) {
                    return new Response('No available shard for connections.')
                }

                return await actor.fetch(request);
            } else {
                return c.text('No `topic` provided.');
            }
        });

        return app.fetch(request, env, ctx);
    },
};
