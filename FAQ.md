# Frequently Asked Questions

We receive a number of questions about Durable Objects and Actors in our community. Over time we will try to capture as many frequently asked questions as we can into this document and the official Cloudflare documentation.

## General

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

## Location Placement

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

## Storage

TBD

## Alarms

TBD

## RPC

<details>
  <summary>What values can be transported over RPC?</summary>
  Nearly all types that are Structured Cloneable ↗ can be used as a parameter or return value of an RPC method. This includes, most basic "value" types in JavaScript, including objects, arrays, strings and numbers. See more details [here](https://developers.cloudflare.com/workers/runtime-apis/rpc/#structured-clonable-types-and-more).
</details>
