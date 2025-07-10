# Cloudflare Actors

**_This project is in active development._**

We are working on building a full-featured framework for building Cloudflare Durable Objects by introducing new patterns and out of the box helper functionality.

## Table of Contents

- [Getting Started](#getting-started)
- [Examples](#examples)
- [FAQ](#faq)
- [Contributing](#contributing)
- [License](#license)

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/en/download/) (>=18.0.0)
- [Wrangler](https://developers.cloudflare.com/workers/wrangler) (>=4.16.0)

### Installation

```bash
npm i @cloudflare/actors
```

## Examples

- [Basic Example](#basic-example)
- [Request Handler](#request-handler)
- [Persist Properties](#persist-properties)
- [RPC](#rpc)
- [Instances Names](#instances-names)
- [Track Instances](#track-instances)
- [Delete Instance](#delete-instance)
- [Location Hints](#location-hints)
- [Access Identifiers](#access-identifiers)
- [Storage Helpers](#storage-helpers)
- [Alarm Helpers](#alarm-helpers)
- [How to use in a Durable Object](#how-to-use-in-a-durable-object)

## FAQ

### General

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

## Contributing

We welcome contributions! Whether it's:

- New examples
- Documentation improvements
- Bug fixes
- Feature suggestions

## License

[MIT](LICENSE)
