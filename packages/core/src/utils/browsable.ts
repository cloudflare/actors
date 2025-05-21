/**
 * Represents a transaction request containing multiple SQL queries to be executed.
 */
export type QueryTransactionRequest = {
    transaction?: QueryRequest[]
}

/**
 * Represents a single SQL query request with optional parameters.
 */
export type QueryRequest = {
    sql: string
    params?: any[]
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
     */
    constructor(sql: SqlStorage | undefined) {
        this.sql = sql;
    }

    /**
     * Executes a transaction containing multiple SQL queries.
     * @param opts - Options containing an array of queries to execute
     * @returns Promise resolving to an array of query results
     */
    async executeTransaction(opts: {
        queries: { sql: string; params?: any[] }[]
    }): Promise<any> {
        const { queries } = opts
        const results = []
    
        for (const query of queries) {
            let result = await this.executeQuery({
                sql: query.sql,
                params: query.params ?? [],
                isRaw: true
            })
    
            if (!result) {
                console.error('Returning empty array.')
                return []
            }
    
            results.push(result)
        }
    
        return results
    }

    /**
     * Executes a raw SQL query with optional parameters.
     * @template U - The type of the record containing the query results
     * @param opts - Options containing the SQL query and optional parameters
     * @returns Promise resolving to a cursor containing the query results
     * @throws Error if the SQL execution fails
     */
    private async executeRawQuery<
        U extends Record<string, SqlStorageValue> = Record<
            string,
            SqlStorageValue
        >,
    >(opts: { sql: string; params?: unknown[] }) {
        const { sql, params } = opts

        try {
            let cursor

            if (params && params.length) {
                cursor = this.sql?.exec<U>(sql, ...params)
            } else {
                cursor = this.sql?.exec<U>(sql)
            }

            return cursor
        } catch (error) {
            console.error('SQL Execution Error:', error)
            throw error
        }
    }

    /**
     * Executes a SQL query and formats the results based on the specified options.
     * @param opts - Options containing the SQL query, parameters, and result format preference
     * @returns Promise resolving to either raw query results or formatted array
     */
    public async executeQuery(opts: {
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