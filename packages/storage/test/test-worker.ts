import { DurableObjectNamespace } from "@cloudflare/workers-types";
import { DurableObject } from "cloudflare:workers";

export interface Env {
  SQL_MIGRATIONS_DO: DurableObjectNamespace<SQLMigrationsDO>;
}

export class SQLMigrationsDO extends DurableObject<Env> {
  constructor(readonly ctx: DurableObjectState, readonly env: Env) {
    super(ctx, env);
  }

  async actorId() {
    return String(this.ctx.id);
  }

  async echo(s: string) {
    return s;
  }

  async sql(query: string) {
    return this.ctx.storage.sql.exec(query).toArray();
  }
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    return new Response("-_-", { status: 404 });
  },
};
