import { parseCronExpression } from "cron-schedule";
import { nanoid } from "nanoid";
import { DurableObject } from "cloudflare:workers";

function getNextCronTime(cron: string) {
    const interval = parseCronExpression(cron);
    return interval.getNextDate();
}

/**
 * Represents a scheduled task within an Actor
 * @template T Type of the payload data
 * @template K Type of the callback
 */
export type Schedule<T = string, K extends keyof any = string> = {
  /** Unique identifier for the schedule */
  id: string;
  /** Name of the method to be called */
  callback: K;
  /** Data to be passed to the callback */
  payload: T;
  /** Actor identifier */
  identifier: string;
} & (
  | {
      /** Type of schedule for one-time execution at a specific time */
      type: "scheduled";
      /** Timestamp when the task should execute */
      time: number;
    }
  | {
      /** Type of schedule for delayed execution */
      type: "delayed";
      /** Timestamp when the task should execute */
      time: number;
      /** Number of seconds to delay execution */
      delayInSeconds: number;
    }
  | {
      /** Type of schedule for recurring execution based on cron expression */
      type: "cron";
      /** Timestamp for the next execution */
      time: number;
      /** Cron expression defining the schedule */
      cron: string;
    }
);

export class Alarms<P extends DurableObject<any>> {
    private parent: P;
    public storage: DurableObjectStorage | undefined;
    public actorName?: string;

    constructor(ctx: DurableObjectState | undefined, parent: P) {
        this.storage = ctx?.storage;
        this.parent = parent;

        void ctx?.blockConcurrencyWhile(async () => {
            return this._tryCatch(async () => {
              // Create alarms table if it doesn't exist (without identifier column for backward compatibility)
              ctx?.storage.sql.exec(`
                CREATE TABLE IF NOT EXISTS _actor_alarms (
                    id TEXT PRIMARY KEY NOT NULL DEFAULT (randomblob(9)),
                    callback TEXT,
                    payload TEXT,
                    type TEXT NOT NULL CHECK(type IN ('scheduled', 'delayed', 'cron')),
                    time INTEGER,
                    delayInSeconds INTEGER,
                    cron TEXT,
                    created_at INTEGER DEFAULT (unixepoch())
                )
            `);

              // This is part of a migration, we're supporting a new column: `identifier`.
              // First, check if identifier column exists and add it if needed
              try {
                  // Try to query the identifier column to see if it exists
                  ctx?.storage.sql.exec(`SELECT identifier FROM _actor_alarms LIMIT 1`);
              } catch (error) {
                  // If the column doesn't exist, add it
                  try {
                      ctx?.storage.sql.exec(`ALTER TABLE _actor_alarms ADD COLUMN identifier TEXT DEFAULT 'default'`);
                  } catch (addError) {
                      console.error('Failed to add identifier column:', addError);
                  }
              }
      
              // Execute any pending alarms and schedule the next alarm
              await this.alarm();
            });
        });
    }

    /**
     * Schedule a task to be executed in the future
     * @template T Type of the payload data
     * @param when When to execute the task (Date, seconds delay, or cron expression)
     * @param callback Name of the method to call
     * @param payload Data to pass to the callback
     * @returns Schedule object representing the scheduled task
     */
    async schedule<T = string>(
        when: Date | string | number,
        callback: keyof typeof this.parent,
        payload?: T
    ): Promise<Schedule<T>> {
        const id = nanoid(9);
    
        if (typeof callback !== "string") {
            throw new Error("Callback must be a string");
        }
    
        if (typeof this.parent[callback] !== "function") {
            throw new Error(`this.parent.${callback} is not a function`);
        }
    
        if (when instanceof Date) {
          const timestamp = Math.floor(when.getTime() / 1000);
          this.sql`
            INSERT OR REPLACE INTO _actor_alarms (id, callback, payload, type, time, identifier)
            VALUES (${id}, ${callback}, ${JSON.stringify(
              payload
            )}, 'scheduled', ${timestamp}, ${this.actorName ?? 'default'})
          `;
    
          await this._scheduleNextAlarm();
    
          return {
            id,
            callback: callback,
            payload: payload as T,
            time: timestamp,
            type: "scheduled",
            identifier: this.actorName ?? 'default'
          };
        }

        if (typeof when === "number") {
          const time = new Date(Date.now() + when * 1000);
          const timestamp = Math.floor(time.getTime() / 1000);
    
          this.sql`
            INSERT OR REPLACE INTO _actor_alarms (id, callback, payload, type, delayInSeconds, time, identifier)
            VALUES (${id}, ${callback}, ${JSON.stringify(
              payload
            )}, 'delayed', ${when}, ${timestamp}, ${this.actorName ?? 'default'})
          `;
    
          await this._scheduleNextAlarm();
    
          return {
            id,
            callback: callback,
            payload: payload as T,
            delayInSeconds: when,
            time: timestamp,
            type: "delayed",
            identifier: this.actorName ?? 'default'
          };
        }
        if (typeof when === "string") {
          const nextExecutionTime = getNextCronTime(when);
          const timestamp = Math.floor(nextExecutionTime.getTime() / 1000);
    
          this.sql`
            INSERT OR REPLACE INTO _actor_alarms (id, callback, payload, type, cron, time, identifier)
            VALUES (${id}, ${callback}, ${JSON.stringify(
              payload
            )}, 'cron', ${when}, ${timestamp}, ${this.actorName ?? 'default'})
          `;
    
          await this._scheduleNextAlarm();
    
          return {
            id,
            callback: callback,
            payload: payload as T,
            cron: when,
            time: timestamp,
            type: "cron",
            identifier: this.actorName ?? 'default'
          };
        }
        throw new Error("Invalid schedule type");
    }

    /**
     * Get a scheduled task by ID
     * @template T Type of the payload data
     * @param id ID of the scheduled task
     * @returns The Schedule object or undefined if not found
     */
    async getSchedule<T = string>(id: string): Promise<Schedule<T> | undefined> {
        const result = this.sql<Schedule<string>>`
          SELECT * FROM _actor_alarms WHERE id = ${id}
        `;
        if (!result) {
          console.error(`schedule ${id} not found`);
          return undefined;
        }
    
        return { ...result[0], payload: JSON.parse(result[0].payload) as T };
    }

    /**
     * Get scheduled tasks matching the given criteria
     * @template T Type of the payload data
     * @param criteria Criteria to filter schedules
     * @returns Array of matching Schedule objects
     */
    getSchedules<T = string>(
        criteria: {
          id?: string;
          type?: "scheduled" | "delayed" | "cron";
          timeRange?: { start?: Date; end?: Date };
        } = {}
    ): Schedule<T>[] {
        let query = "SELECT * FROM _actor_alarms WHERE 1=1";
        const params = [];
    
        if (criteria.id) {
          query += " AND id = ?";
          params.push(criteria.id);
        }
    
        if (criteria.type) {
          query += " AND type = ?";
          params.push(criteria.type);
        }
    
        if (criteria.timeRange) {
          query += " AND time >= ? AND time <= ?";
          const start = criteria.timeRange.start || new Date(0);
          const end = criteria.timeRange.end || new Date(999999999999999);
          params.push(
            Math.floor(start.getTime() / 1000),
            Math.floor(end.getTime() / 1000)
          );
        }
    
        if (!this.storage?.sql) {
            // Or throw an error, depending on desired behavior
            return [];
        }
        const result = this.storage.sql
          .exec(query, ...params)
          .toArray()
          .map((row: any) => ({
            ...row,
            payload: JSON.parse(row.payload as string) as T,
          })) as Schedule<T>[];
    
        return result;
    }

    /**
     * Cancel a scheduled task
     * @param id ID of the task to cancel
     * @returns true if the task was cancelled, false otherwise
     */
    async cancelSchedule(id: string): Promise<boolean> {
        this.sql`DELETE FROM _actor_alarms WHERE id = ${id}`;
    
        await this._scheduleNextAlarm();
        return true;
    }

    private async _scheduleNextAlarm() {
        // Find the next schedule that needs to be executed
        const result = this.sql`
          SELECT time, COALESCE(identifier, 'default') as identifier FROM _actor_alarms 
          WHERE time > ${Math.floor(Date.now() / 1000)}
          ORDER BY time ASC 
          LIMIT 1
        `;
        if (!result || !this.storage) return;

        if (result.length > 0 && "time" in result[0]) {
          const nextTime = (result[0].time as number) * 1000;
          await this.storage.setAlarm(nextTime);
        }
    }

    public readonly alarm = async (alarmInfo?: AlarmInvocationInfo) => {
        const now = Math.floor(Date.now() / 1000);
    
        // Get all schedules that should be executed now
        const result = this.sql<Schedule<string>>`
          SELECT *, COALESCE(identifier, 'default') as identifier FROM _actor_alarms WHERE time <= ${now}
        `;
    
        for (const row of result || []) {
          const callback = this.parent[row.callback as keyof P];
          if (!callback) {
            console.error(`callback ${row.callback} not found`);
            continue;
          }

          try {
            const identifier = row.identifier || 'default';
            (this.parent as any).setName(identifier);
          } catch (error) {
            console.error(`error setting identifier`, error);
          }
          
          try {
            await (
              callback as (
                payload: unknown,
                schedule: Schedule<unknown>
              ) => Promise<void>
            ).bind(this.parent)(JSON.parse(row.payload as string), row);
          } catch (e) {
            console.error(`error executing callback "${row.callback}"`, e);
          }
          
          if (row.type === "cron") {
            // Update next execution time for cron schedules
            const nextExecutionTime = getNextCronTime(row.cron);
            const nextTimestamp = Math.floor(nextExecutionTime.getTime() / 1000);
    
            this.sql`
              UPDATE _actor_alarms SET time = ${nextTimestamp} WHERE id = ${row.id}
            `;
          } else {
            // Delete one-time schedules after execution
            this.sql`
              DELETE FROM _actor_alarms WHERE id = ${row.id}
            `;
          }
        }
    
        // Schedule the next alarm
        await this._scheduleNextAlarm();
    };

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

    private async _tryCatch<T>(fn: () => T | Promise<T>) {
        try {
          return await fn();
        } catch (e) {
          throw e;
        }
    }
}
