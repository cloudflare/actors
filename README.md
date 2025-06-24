# Cloudflare Actors

***This project is in active development.***

We are working on building a full-featured framework for building Cloudflare Workers and Durable Objects by introducing new patterns and out of the box helper functionality. 

## Table of Contents

- [Getting Started](#getting-started)
- [Examples](#examples)
- [Contributing](#contributing)
- [License](#license)

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/en/download/) (>=18.0.0)
- [Wrangler](https://developers.cloudflare.com/workers/wrangler) (>=4.16.0)

### Installation

```bash
npm install
```

### Running the Examples

The examples are located in the `examples` directory. You can run them using the following command:

```bash
npm run dev
```

## Examples

### Actor

```typescript
export class MyActor extends Actor<Env> {
    async fetch(request: Request): Promise<Response> {
        return new Response('Hello, World!')
    }
}

export default handler(MyActor);
```

### Actor with Custom Name

```typescript
export class MyActor extends Actor<Env> {
    static nameFromRequest(request: Request): string {
        return 'user-123'
    }

    async fetch(request: Request): Promise<Response> {
        return new Response('Hello, World!')
    }
}

export default handler(MyActor);
```

### Actor with Storage

```typescript
export class MyStorageActor extends Actor<Env> {
    constructor(ctx?: ActorState, env?: Env) {
        super(ctx, env);

        // Set migrations for the SQLite database
        this.storage.migrations = [{
            idMonotonicInc: 1,
            description: "First migration",
            sql: "CREATE TABLE IF NOT EXISTS test (id INTEGER PRIMARY KEY)"
        }, {
            idMonotonicInc: 2,
            description: "Second migration",
            sql: "CREATE TABLE IF NOT EXISTS test2 (id INTEGER PRIMARY KEY)"
        }];
    }

    async fetch(request: Request): Promise<Response> {
        // Run migrations before executing our query
        await this.storage.runMigrations();

        // Now we can proceed with querying
        const query = this.sql`SELECT * FROM sqlite_master LIMIT 10;`
        return new Response(`${JSON.stringify(query)}`)
    }
}

export default handler(MyStorageActor);
```

### Actor with Alarms

```typescript
export class MyAlarmActor extends Actor<Env> {
    async fetch(request: Request): Promise<Response> {
        // Schedule an alarm to trigger in 10 seconds adding two values and a description
        this.alarms.schedule(10, 'addFromAlarm', [1, 2, 'Adding 1 + 2']);
        return new Response('Alarm set')
    }

    // Called from our alarm defined above
    public async addFromAlarm(a: number, b: number, desc: string): Promise<number> {
        console.log(`Alarm triggered, you can view this alarm in your Worker logs: ${a} + ${b} (desc: ${desc})`);
        return a + b;
    }
}

export default handler(MyAlarmActor);
```

### Storage & Alarms with DurableObject Class

```typescript
export class MyDurableObject extends DurableObject<Env> {
    storage: Storage;
    alarms: Alarms<this>;
    
    constructor(ctx: DurableObjectState, env: Env) {
        super(ctx, env)
        this.storage = new Storage(ctx.storage);
        this.alarms = new Alarms(ctx, this);
    }

    async fetch(request: Request): Promise<Response> {
        this.alarms.schedule(10, "addFromAlarm", [1, 2]);
        const query = this.storage.sql`SELECT 10;`
        return new Response(`Query Result: ${JSON.stringify(query)}`);
    }

    // This method is required to handle alarms
    alarm(alarmInfo?: any): void | Promise<void> {
        // Forward the alarm to the alarms handler
        if (this.alarms) {
            return this.alarms.alarm(alarmInfo);
        }
        return;
    }

    // Called from our alarm defined above
    public async addFromAlarm(a: number, b: number): Promise<number> {
        console.log(`Alarm triggered, you can view this alarm in your Worker logs: ${a} + ${b}`);
        return a + b;
    }
}

export default {
    async fetch(request: Request, env: Env, ctx: ExecutionContext) {
        const id = env.MyDurableObject.idFromName(new URL(request.url).pathname);
        const stub = env.MyDurableObject.get(id);
        const response = await stub.fetch(request);

        return response;
    },
};
```

## Contributing

We welcome contributions! Whether it's:

- New examples
- Documentation improvements
- Bug fixes
- Feature suggestions

## License

[MIT](LICENSE)
