import type { DurableObjectStorage } from "@cloudflare/workers-types";
import { SQLSchemaMigration, SQLSchemaMigrations } from "./sql-schema-migrations";

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
    params?: any[]
}

interface StudioTransactionRequest {
	type: 'transaction';
	statements: string[];
    params?: any[]
}

type StudioRequest = StudioQueryRequest | StudioTransactionRequest;

/**
 * Handler class for executing SQL queries and transactions against a SQL storage backend.
 * Provides methods for executing single queries and transactions with proper error handling
 * and result formatting.
 * 
 * This class also provides access to methods from the underlying DurableObjectStorage
 * through the proxy pattern.
 */
export class Storage {
    public raw: DurableObjectStorage | undefined;
    public sqlStorage: SqlStorage | undefined;
    private _migrationsArray: SQLSchemaMigration[] = [];
    public hasRanMigrations: boolean = false;
    
    /**
     * Gets the current migrations array
     */
    public get migrations(): SQLSchemaMigration[] {
        return this._migrationsArray;
    }
    
    /**
     * Sets the migrations array and updates the SQLSchemaMigrations instance if available
     */
    public set migrations(value: SQLSchemaMigration[]) {
        this._migrationsArray = value;
        
        // Update the SQLSchemaMigrations instance if it exists
        if (this.raw && this._migrations) {
            this._migrations = new SQLSchemaMigrations({
                doStorage: this.raw,
                migrations: value
            });
        }
    }
    public _migrations: SQLSchemaMigrations | undefined;

    /**
     * Creates a new instance of Storage.
     * @param sql - The SQL storage instance to use for queries
     * @param storage - The Durable Object storage instance
     */
    constructor(storage?: DurableObjectStorage) {
        this.raw = storage;
        this.sqlStorage = storage?.sql;

        if (storage) {
            this._migrations = new SQLSchemaMigrations({
                doStorage: storage,
                migrations: this._migrationsArray
            });
        }
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
                cursor = this.sqlStorage?.exec(sql, ...params)
            } else {
                cursor = this.sqlStorage?.exec(sql)
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
        
            if (!this.sqlStorage) {
                throw new Error('No SQL storage provided');
            }
            
            // Execute the SQL query with the provided values
            return [...this.sqlStorage.exec(query, ...values)] as T[];
        } catch (e) {
            console.error(`failed to execute sql query: ${query}`, e);
            throw e;
        }
    }

    /**
     * Executes a SQL query and formats the results based on the specified options.
     * @param opts - Options containing the SQL query, parameters, and result format preference
     * @returns Promise resolving to either raw query results or formatted array
     */
    private async query(sql: string, params?: unknown[], isRaw?: boolean) {
        // Attempt to run migrations if they have not been ran already
        this.runMigrations();

        // Now proceed with executing the query
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

    async runMigrations() {
        if (this.hasRanMigrations) return
        if (!this._migrations) {
            throw new Error('No migrations provided');
        }

        const response = await this._migrations.runAll();
        this.hasRanMigrations = true;
        return response
    }

    async __studio(cmd: StudioRequest) {
        const storage = this.raw as DurableObjectStorage;

        if (cmd.type === 'query') {
            return this.query(cmd.statement, cmd.params);
        } else if (cmd.type === 'transaction') {
            return storage.transaction(async () => {
                const results = [];
                for (const statement of cmd.statements) {
                    results.push(await this.query(statement, cmd.params, true));
                }

                return results;
            });
        }
    }
}