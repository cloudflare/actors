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

interface StudioQueryRequest {
	type: 'query';
	statement: string;
}

interface StudioTransactionRequest {
	type: 'transaction';
	statements: string[];
}

type StudioRequest = StudioQueryRequest | StudioTransactionRequest;

/**
 * Handler class for executing SQL queries and transactions against a SQL storage backend.
 * Provides methods for executing single queries and transactions with proper error handling
 * and result formatting.
 */
export class Storage {
    public storage: DurableObjectStorage | undefined;
    public sql: SqlStorage | undefined;

    /**
     * Creates a new instance of Storage.
     * @param sql - The SQL storage instance to use for queries
     * @param storage - The Durable Object storage instance
     */
    constructor(storage?: DurableObjectStorage) {
        this.storage = storage;
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
    public async query(sql: string, params?: unknown[], isRaw?: boolean) {
        const cursor = await this.executeRawQuery({ sql, params })
        if (!cursor) return []

        if (isRaw) {
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

    async __studio(cmd: StudioRequest) {
        const storage = this.storage as DurableObjectStorage;

        if (cmd.type === 'query') {
            return this.query(cmd.statement);
        } else if (cmd.type === 'transaction') {
            return storage.transactionSync(() => {
                const results = [];
                for (const statement of cmd.statements) {
                    results.push(this.query(statement));
                }

                return results;
            });
        }
    }
}