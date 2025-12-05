import { Actor, ActorConfiguration, Persist } from '../../../packages/core/src'

const CONNECTIONS_LIMIT = 10_000    // Maximum sockets connection limit per shard
export const MAX_SHARD_COUNT = 5    // Maximum number of shards that can exist per topic

interface TopicMetadata {
    topic: string;
}

export async function getFirstAvailableTopicShard(topic: string, shardVersion: number = 0): Promise<DurableObjectStub | null> {
    const stub = TopicActor.get(`${topic}_${shardVersion}`)
    const allowed: { success: boolean, limitReached?: boolean } = await stub.canSupportConnection();

    if (!allowed.success) {
        if (allowed.limitReached) {
            throw new Error("Maximum connections to this topic and all shards.");
        }
        
        // If this shard is full but we haven't reached the limit, try the next shard
        if (shardVersion < MAX_SHARD_COUNT) {
            return getFirstAvailableTopicShard(topic, shardVersion + 1);
        } else {
            throw new Error("All shards are full for this topic.");
        }
    }

    // Now that we know we have an available shard to us, let's instantiate it
    await stub.init(shardVersion, { topic: topic });
    return stub;
}

export class TopicActor extends Actor<Env> {
    // Which shard version of this channel are we using currently
    private shardVersion: number = 0;
    // Marks which channel this object represents
    @Persist
    private topic: string | undefined = undefined;

    static configuration(request: Request): ActorConfiguration {
        return {
            sockets: {
                upgradePath: '/subscribe',
            }
        };
    }

    async init(version: number, metadata: TopicMetadata): Promise<boolean> {
        const { topic } = metadata;
        this.shardVersion = version;
        this.topic = topic;

        return true;
    }

    protected shouldUpgradeSocket(request: Request): boolean {
        return true;
    }

    public publish(message: string) {
        this.sockets.message(message, '*');
    }

    public async canSupportConnection(): Promise<{ success: boolean, limitReached?: boolean }> {
        if (this.sockets.connections.size < CONNECTIONS_LIMIT) {
            return { success: true }
        } else if (this.sockets.connections.size >= CONNECTIONS_LIMIT && this.shardVersion < MAX_SHARD_COUNT) {
            return { success: false }
        }

        return { 
            success: false,
            limitReached: (this.shardVersion + 1) === MAX_SHARD_COUNT
        }
    }
}