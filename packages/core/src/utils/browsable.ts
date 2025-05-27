/**
 * Represents a single SQL query request with optional parameters.
 */
export type QueryRequest = {
    sql: string
    params?: any[]
}

/**
 * Interface for SQL storage with transaction support
 */
interface SqlStorage {
    exec(sql: string, ...params: unknown[]): any;
}

/**
 * Handler class for executing SQL queries and transactions against a SQL storage backend.
 * Provides methods for executing single queries and transactions with proper error handling
 * and result formatting.
 */
export class BrowsableHandler {
    public sql: SqlStorage | undefined;

    /**
     * Creates a new instance of BrowsableHandler.
     * @param sql - The SQL storage instance to use for queries
     * @param storage - The Durable Object storage instance
     */
    constructor(storage?: DurableObjectStorage) {
        this.sql = storage?.sql;
    }

    /**
     * Executes a raw SQL query with optional parameters.
     * @param opts - Options containing the SQL query and optional parameters
     * @returns Promise resolving to a cursor containing the query results
     * @throws Error if the SQL execution fails
     */
    private async executeRawQuery(opts: { sql: string; params?: unknown[] }) {
        const { sql, params } = opts

        try {
            let cursor;

            if (params && params.length) {
                cursor = this.sql?.exec(sql, ...params)
            } else {
                cursor = this.sql?.exec(sql)
            }

            if (!cursor) {
                console.log('No cursor returned from query');
                return null;
            }

            return cursor;
        } catch (error) {
            console.error('SQL Execution Error:', error);
            throw error
        }
    }

    /**
     * Executes a SQL query and formats the results based on the specified options.
     * @param opts - Options containing the SQL query, parameters, and result format preference
     * @returns Promise resolving to either raw query results or formatted array
     */
    public async query(opts: {
        sql: string
        params?: unknown[]
        isRaw?: boolean
    }) {
        const cursor = await this.executeRawQuery(opts)
        if (!cursor) return []

        if (opts.isRaw) {
            return {
                columns: cursor.columnNames,
                rows: Array.from(cursor.raw()),
                meta: {
                    rows_read: cursor.rowsRead,
                    rows_written: cursor.rowsWritten,
                },
            }
        }

        return cursor.toArray()
    }
}