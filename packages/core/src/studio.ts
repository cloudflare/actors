interface StudioQueryRequest {
	type: 'query';
	id: string;
	statement: string;
}

interface StudioTransactionRequest {
	type: 'transaction';
	id: string;
	statements: string[];
}

type StudioRequest = StudioQueryRequest | StudioTransactionRequest;

export class BrowsableHandler {
    public sql: SqlStorage | undefined;

    constructor(sql: SqlStorage | undefined) {
        this.sql = sql;
    }

    async fetch(request: Request) {
        const url = new URL(request.url);

        if (request.method === 'GET') {
            const stubId = url.searchParams.get('instance');
            const className = url.searchParams.get('class');
            const password = url.searchParams.get('password');

            if (!stubId || !className || !password) {
                return new Response(createHomepageInterface(), { headers: { 'Content-Type': 'text/html' } });
            } else {
                return new Response(createStudioInterface(stubId, className, password), { headers: { 'Content-Type': 'text/html' } });
            }
        } else if (request.method === 'POST') {
            const body = (await request.json()) as StudioRequest;
    
            if (body.type === 'query' || body.type === 'transaction') {
                try {
                    if (body.type === 'query') {
                        const result = await this.executeQuery(this.sql!, body.statement);
                        return Response.json({ result });
                    } else if (body.type === 'transaction') {
                        const result = await this.executeTransaction({
                            queries: [{ sql: body.statements[0] }]
                        });
                        return Response.json({ result });
                    }
                } catch (e) {
                    if (e instanceof Error) {
                        return Response.json({ error: e.message });
                    }
                    return Response.json({ error: 'Unknown error' });
                }
            }
    
            return Response.json({ error: 'Invalid request' });
        }
        
        return new Response('Not found', { status: 404 });
    }

    async executeTransaction(opts: {
        queries: { sql: string; params?: any[] }[]
    }): Promise<any> {
        const { queries } = opts
        const results = []
    
        for (const query of queries) {
            let result = await this.executeQuery(this.sql!, query.sql)
    
            if (!result) {
                console.error('Returning empty array.')
                return []
            }
    
            results.push(result)
        }
    
        return results
    }

    async executeQuery(sql: SqlStorage, statement: string) {
        const cursor = sql.exec(statement);
    
        const columnSet = new Set();
        const columnNames = cursor.columnNames.map((colName) => {
            let renameColName = colName;
    
            for (let i = 0; i < 20; i++) {
                if (!columnSet.has(renameColName)) break;
                renameColName = '__' + colName + '_' + i;
            }
    
            return {
                name: renameColName,
                displayName: colName,
                originalType: 'text',
                type: undefined,
            };
        });
    
        return {
            headers: columnNames,
            rows: Array.from(cursor.raw()).map((r) =>
                columnNames.reduce((a, b, idx) => {
                    a[b.name] = r[idx];
                    return a;
                }, {} as Record<string, unknown>)
            ),
            stat: {
                queryDurationMs: 0,
                rowsAffected: 0,
                rowsRead: cursor.rowsRead,
                rowsWritten: cursor.rowsWritten,
            },
        };
    }
}

export function createHomepageInterface() {
	return `<!DOCTYPE >
  <html>
    <title>Actor Studio</title>
    <style>
      html, body {
        font-size: 20px;
        font-family: monospace;
        padding: 1rem;
      }

      input, button {
        font-size: 1rem;
        padding: 0.2rem 0.5rem;
        outline: none;
        font-family: monospace;
      }

      h1 { font-size: 1.5rem; }

      form {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
    </style>
  </html>
  <body>
    <h1>Actor Studio</h1>

    <form method='get' action=''>
        <input id='class' name='class' placeholder='Actor class name' required></input>
        <input id='instance' name='instance' placeholder='Instance name' required></input>
        <input id='password' type='password' name='password' placeholder='Password' required></input>

        <button id='submit'>Continue</button>
    </form>
  </body>
  </html>`;
}

function createStudioInterface(stubId: string, className: string, password: string) {
	return `<!DOCTYPE >
  <html>
    <head>
      <style>
        html,
        body {
          padding: 0;
          margin: 0;
          width: 100vw;
          height: 100vh;
        }
  
        iframe {
          width: 100vw;
          height: 100vh;
          overflow: hidden;
          border: 0;
        }
      </style>
      <title>Actor Studio</title>
      <link
        rel="icon"
        type="image/x-icon"
        href="https://studio.outerbase.com/icons/outerbase.ico"
      />
    </head>
    <body>
      <script>
        function handler(e) {
          if (e.data.type !== "query" && e.data.type !== "transaction") return;
  
          fetch(window.location.pathname, {
            method: "post",
            body: JSON.stringify({ ...e.data, instance: "${stubId}", class: "${className}", password: "${password}" }),
          })
            .then((r) => {
              if (!r.ok) {
                document.getElementById("editor").contentWindow.postMessage(
                  {
                    id: e.data.id,
                    type: e.data.type,
                    error: "Something went wrong",
                  },
                  "*"
                );
                throw new Error("Something went wrong");
              }
              return r.json();
            })
            .then((r) => {
              if (r.error) {
                document.getElementById("editor").contentWindow.postMessage(
                  {
                    id: e.data.id,
                    type: e.data.type,
                    error: r.error,
                  },
                  "*"
                )
              }
  
              const response = {
                id: e.data.id,
                type: e.data.type,
                data: r.result
              };
  
              document
                .getElementById("editor")
                .contentWindow.postMessage(response, "*");
            })
            .catch(console.error);
        }
  
        window.addEventListener("message", handler);
      </script>
  
      <iframe
        id="editor"
        allow="clipboard-read; clipboard-write"
        src="https://studio.outerbase.com/embed/starbase"
      ></iframe>
    </body>
  </html>`;
}
