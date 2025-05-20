export const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers':
        'Authorization, Content-Type, X-Starbase-Source, X-Data-Source',
    'Access-Control-Max-Age': '86400',
} as const

export function corsPreflight(): Response {
    return new Response(null, {
        status: 204,
        headers: corsHeaders,
    })
}

export type QueryTransactionRequest = {
    transaction?: QueryRequest[]
}

export type QueryRequest = {
    sql: string
    params?: any[]
}

export function createResponse(
    result: unknown,
    error: string | undefined,
    status: number
): Response {
    return new Response(JSON.stringify({ result, error }), {
        status,
        headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
        },
    })
}

export class BrowsableHandler {
    public sql: SqlStorage | undefined;
    private supportedRoutes = ['/query/raw'];

    constructor(sql: SqlStorage | undefined) {
        this.sql = sql;
    }

    async fetch(request: Request) {
        const url = new URL(request.url);
        const path = url.pathname;

        // Check if this is a supported route that we should handle in our browsable
        // class. If no matches are found we call up to super and as a last resort
        // return a 404 to let the user know this inheritance class did not find a 
        // request to match on.
        if (this.supportedRoutes.includes(path)) {
            // Handle CORS preflight, at the moment this acts as a very permissive
            // acceptance of requests. Expecting the users to add in their own
            // version of authentication to protect against users misusing these
            // endpoints.
            if (request.method === 'OPTIONS') {
                return corsPreflight();
            }
            
            if (path === '/query/raw' && request.method === 'POST') {
                const { sql, params, transaction } = (await request.json()) as any;
                let data = await this.executeTransaction({
                    queries: transaction ?? [{ sql, params }]
                });

                return createResponse(data, undefined, 200);
            }
        }
        
        return new Response('Not found', { status: 404 });
    }

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