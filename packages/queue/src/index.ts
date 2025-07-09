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
    private isProcessing: boolean = false;

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
    async enqueue<T = unknown>(callback: keyof P, payload: T): Promise<string> {
      const id = nanoid(9);
      if (typeof callback !== "string") {
        throw new Error("Callback must be a string");
      }

      if (typeof this.parent[callback] !== "function") {
        throw new Error(`this.${callback} is not a function`);
      }

      this.sql`
        CREATE TABLE IF NOT EXISTS _actor_queues (id TEXT PRIMARY KEY, payload TEXT, callback TEXT, created_at INTEGER)
      `;

      this.sql`
        INSERT OR REPLACE INTO _actor_queues (id, payload, callback, created_at)
        VALUES (${id}, ${JSON.stringify(payload)}, ${callback}, ${Date.now()})
      `;

      // Only start a new flush if one isn't already running
      if (!this.isProcessing) {
        void this._flushQueue().catch((e) => {
          console.error("Error flushing queue:", e);
        });
      }

      return id;
    }

    private async _flushQueue() {
      // If already processing, don't start another processing cycle
      if (this.isProcessing) {
        return;
      }
      
      this.isProcessing = true;
      
      try {
        while (true) {
          const result = this.sql<QueueItem<string>>`
            SELECT * FROM _actor_queues
            ORDER BY created_at ASC
            LIMIT 1
          `;

          if (!result || result.length === 0) {
            break;
          }

          for (const row of result) {
            const callback = this.parent[row.callback as keyof P];
            if (!callback) {
              console.error(`callback ${row.callback} not found`);
              // Remove invalid callbacks from the queue
              await this.dequeue(row.id);
              continue;
            }
            
            // TODO: Add retries and backoff
            try {
              await (
                callback as (
                  payload: unknown,
                  queueItem: QueueItem<string>
                ) => Promise<void>
              ).bind(this.parent)(JSON.parse(row.payload as string), row);
              
              // Dequeue the task after successful execution
              await this.dequeue(row.id);
            } catch (e) {
              console.error(`error executing callback "${row.callback}"`, e);
              // Optionally: You could implement retry logic here instead of removing failed tasks
              // For now, we'll remove failed tasks to prevent infinite retry loops
              await this.dequeue(row.id);
            }
          }
        }
      } catch (error) {
        console.error("Error in queue processing:", error);
      } finally {
        // Reset the processing flag when done
        this.isProcessing = false;
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