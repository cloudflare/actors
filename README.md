# Cloudflare Actors

**_This project is in active development._**

We are building a full-featured framework that makes developing Cloudflare Durable Objects easier by introducing new patterns and out of the box functionality that help developers.

## Features

- [Request Handler](./examples/handler/) to easily define entrypoints to your Actor, Worker, or Request
- [Lifecycle Methods](./examples/lifecycle-hooks/) enable you to tap into important lifecycle events
- [Persistent Properties](https://github.com) that store property values between requests and evictions
- [RPC Interface](./examples/rpc/) into other Actors with a simple `MyActor.get('id')` interface
- [Managing Instances](./examples/manage-instances/) track, delete, and access all instances that have been created
- [Location Placement](./examples/location-placement/) allow you to control the location of your Actor
- [SQL Migrations](https://github.com) to apply migrations to the SQLite storage
- [Multiple Alarms](https://github.com) set any number of alarms by timestamp, delay, or cron

And many more features, check out the [Examples](./examples) for more information.

## Getting Started

### Step 1: Install the package

```bash
npm i @cloudflare/actors
```

### Step 2: Update your Wrangler Configuration

Notice the code class name in your Typescript implementation must match the binding `name`, `class_name` and `new_sqlite_classes` value in the configuration. Verify all of the values match.

```jsonc
{
  "migrations": [
    {
      "new_sqlite_classes": ["MyActor"],
      "tag": "v1"
    }
  ],
  "durable_objects": {
    "bindings": [
      {
        "class_name": "MyActor",
        "name": "MyActor"
      }
    ]
  }
}
```

### Step 3: Create your class implementation:

```typescript
import { Actor, handler } from "@cloudflare/actors";

export class MyActor extends Actor<Env> {
  async fetch(request: Request): Promise<Response> {
    return new Response("Hello, World!");
  }
}

export default handler(MyActor);
```

## Examples

- [Basic Example](./examples/basic)
- [Request Handler](./examples/handler)
- [RPC Interface](./examples/rpc)
- [Managing Instances](./examples/manage-instances)
- [Lifecycle Hooks](./examples/lifecycle-hooks)
- [Location Placement](./examples/location-placement)
- [How to use without Actor class](./examples/durable-objects/)

## FAQ

### General

<details>
  <summary>What is an Actor?</summary>
  An Actor is a Durable Object that is stateful and has access to both compute and storage. You can think of it as a small server instance that is active when being accessed and asleep when not.
</details>

<details>
  <summary>How long does a single request keep my Actor alive for?</summary>
  A single request will keep the Actor alive for ~10 seconds.
</details>

<details>
  <summary>Can I keep my Actor alive longer?</summary>
  Using `setTimeout` in your code can keep it alive for up to ~60 seconds.
</details>

<details>
  <summary>Are there other ways to keep my code alive longer?</summary>
  Yes, you can use alarms to keep the Actor alive longer.
</details>

<details>
  <summary>Does every new request reset the time until the Actor is no longer in memory?</summary>
  Yes.
</details>

---

### Location Placement

<details>
  <summary>How do I control the location of my Actor?</summary>
  You can use location hints to control the location of your Actor.
</details>

<details>
  <summary>Where does my Actor live if I do not specify a location hint?</summary>
  If you do not specify a location hint, your Actor will be placed in the region closest to the user.
</details>

<details>
  <summary>Can you change the location or region of your Actor?</summary>
  No, you cannot change the location or region of your Actor. Once it has been instantiated it will always live in that region. If you want to move your Actor to a different region, you will need to deploy a new version of your code.
</details>

<details>
  <summary>With a location hint where will my Actor be placed?</summary>
  With a location hint, your Actor will be placed in the region you specified. The instance will be spawned somewhere randomly within the location region
  you provide. For example if you provide the `enam` location hint, the instance will be spawned somewhere randomly within the Eastern North America region.
</details>

<details>
  <summary>What happens if the data center where my Actor is located goes down?</summary>
  If the data center where your Actor is located goes down, your Actor will be moved to another data center.
</details>

---

See [FAQ](./FAQ.md) for more answers to common questions.

---

## Contributing

We welcome contributions! Please refer to our [Contributing Guidelines](./CONTRIBUTING.md) for more information.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
