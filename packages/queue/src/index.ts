import { nanoid } from "nanoid";
import { DurableObject } from "cloudflare:workers";
import type { DurableObjectStorage } from "@cloudflare/workers-types";


export type QueueItem<T = string> = {
    id: string;
    payload: T;
    callback: keyof DurableObject<unknown>;
    created_at: number;
};

export class Queue<P extends DurableObject<any>> {
    private parent: P;
    public storage: DurableObjectStorage | undefined;

    constructor(ctx: DurableObjectState | undefined, parent: P) {
        this.storage = ctx?.storage;
        this.parent = parent;
    }

    /**
     * Queue a task to be executed in the future
     * @param payload Payload to pass to the callback
     * @param callback Name of the method to call
     * @returns The ID of the queued task
     */
    async queue<T = unknown>(callback: keyof this, payload: T): Promise<string> {
      const id = nanoid(9);
      if (typeof callback !== "string") {
        throw new Error("Callback must be a string");
      }

      if (typeof this[callback] !== "function") {
        throw new Error(`this.${callback} is not a function`);
      }

      this.sql`
        INSERT OR REPLACE INTO _actor_queues (id, payload, callback)
        VALUES (${id}, ${JSON.stringify(payload)}, ${callback})
      `;

      void this._flushQueue().catch((e) => {
        console.error("Error flushing queue:", e);
      });

      return id;
    }

    private async _flushQueue() {
      while (true) {
        const result = this.sql<QueueItem<string>>`
        SELECT * FROM _actor_queues
        ORDER BY created_at ASC
        LIMIT 1
      `;

        if (!result) {
          break;
        }

        for (const row of result || []) {
          const callback = this.parent[row.callback as keyof P];
          if (!callback) {
            console.error(`callback ${row.callback} not found`);
            continue;
          }
          // const { connection, request } = agentContext.getStore() || {};
          // await agentContext.run(
          //   { agent: this, connection: connection, request: request },
          //   async () => {
          //     // TODO: add retries and backoff
          //     await (
          //       callback as (
          //         payload: unknown,
          //         queueItem: QueueItem<string>
          //       ) => Promise<void>
          //     ).bind(this)(JSON.parse(row.payload as string), row);
          //   }
          // );
          try {
            await (
              callback as (
                payload: unknown,
                queueItem: QueueItem<string>
              ) => Promise<void>
            ).bind(this.parent)(JSON.parse(row.payload as string), row);
          } catch (e) {
            console.error(`error executing callback "${row.callback}"`, e);
          }
        }
      }
    }

    /**
     * Dequeue a task by ID
     * @param id ID of the task to dequeue
     */
    async dequeue(id: string) {
      this.sql`DELETE FROM _actor_queues WHERE id = ${id}`;
    }

    /**
     * Dequeue all tasks
     */
    async dequeueAll() {
      this.sql`DELETE FROM _actor_queues`;
    }

    /**
     * Dequeue all tasks by callback
     * @param callback Name of the callback to dequeue
     */
    async dequeueAllByCallback(callback: string) {
      this.sql`DELETE FROM _actor_queues WHERE callback = ${callback}`;
    }

    /**
     * Get a queued task by ID
     * @param id ID of the task to get
     * @returns The task or undefined if not found
     */
    async getQueue(id: string): Promise<QueueItem<string> | undefined> {
      const result = this.sql<QueueItem<string>>`
        SELECT * FROM _actor_queues WHERE id = ${id}
      `;
      return result
        ? { ...result[0], payload: JSON.parse(result[0].payload) }
        : undefined;
    }

    /**
     * Execute SQL queries against the Agent's database
     * @template T Type of the returned rows
     * @param strings SQL query template strings
     * @param values Values to be inserted into the query
     * @returns Array of query results
     */
    sql<T = Record<string, string | number | boolean | null>>(
      strings: TemplateStringsArray,
      ...values: (string | number | boolean | null)[]
    ) {
      let query = "";
      try {
        // Construct the SQL query with placeholders
        query = strings.reduce(
          (acc, str, i) => acc + str + (i < values.length ? "?" : ""),
          ""
        );

        if (!this.storage) {
          throw new Error("Storage not initialized");
        }
  
        // Execute the SQL query with the provided values
        return [...this.storage.sql.exec(query, ...values)] as T[];
      } catch (e) {
        console.error(`failed to execute sql query: ${query}`, e);
        throw e;
      }
  }
}