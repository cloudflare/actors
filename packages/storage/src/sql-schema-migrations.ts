import type { DurableObjectStorage } from "@cloudflare/workers-types";

/**
 * Represents a single SQL schema migration to run.
 */
export interface SQLSchemaMigration {
	/**
	 * Each migration is identified by this number. You should always use monotonically
	 * increasing numbers for any new migration added, and never change already applied
	 * migrations.
	 * If you modify the `sql` statement of an already applied migration the change will not be applied.
	 */
	idMonotonicInc: number;

	/**
	 * Just a description for you, the coder, to know what the migration is about.
	 * This is not used in any way by the migrations runner.
	 */
	description: string;

	/**
	 * The SQL statement to execute for a single schema migration.
	 * Can be multiple statements separated by semicolon (`;`).
	 * This statement is passed directly to the `storage.sql.exec()` function.
	 * See https://developers.cloudflare.com/durable-objects/api/storage-api/#sqlexec
	 *
	 * You should always try and make your SQL statements to be safe to run multiple times.
	 * Even though `SQLSchemaMigrations.runAll()` keeps track of the last migration ID and
	 * never runs anything less than that ID, it's best practice for your statements to be defensive.
	 * For example use `CREATE TABLE IF NOT EXISTS` instead of `CREATE TABLE`.
	 *
	 * Also, you should never change the `sql` code of an already ran migration. Add a new entry
	 * in the `SQLSchemaMigrationsConfig.migrations` list altering the schema as you wish.
	 *
	 * In majority of cases you should always provide this. In the cases where you need to dynamically
	 * fetch your statements at runtime, the `SQLSchemaMigrations.runAll` function accepts
	 * a function (`genSql`) that will be called when migrations are executed and based on the `idMonotonicInc`
	 * you can return the SQL statement to run at that point.
	 * If `sql` is provided, then that callback function is not called even if provided.
	 */
	sql?: string;
}

export interface SQLSchemaMigrationsConfig {
	/**
	 * The `DurableObjectState.storage` property of your Durable Object instance.
	 * Usually the `ctx` argument in your DO class constructor, or `state` in some codebases.
	 * See https://developers.cloudflare.com/durable-objects/api/state/#storage
	 */
	doStorage: DurableObjectStorage;

	/**
	 * The list of SQL schema migrations to run in the SQLite database of the Durable Object instance.
	 * Once the given migrations run at least once, you should never modify existing entries,
	 * otherwise you risk corrupting your database, since already ran migrations, will NOT run again.
	 */
	migrations: SQLSchemaMigration[];
}

/**
 * SQLSchemaMigrations is a simple class to manage your SQL migrations when using SQLite Durable Objects (DO).
 *
 * It accepts a config with the Durable Object `storage`, and a list of migrations.
 * This list of migrations should cover everything migration ran ever, not just new ones to run.
 *
 * Each migration is identified by a monotonically increasing identifier (`idMonotonicInc`).
 * Once the `runAll()` function has been called at least once, the migrations processed should never
 * change from that point on. Otherwise, if you change the SQL statement of an already ran migration
 * that change will not be applied.
 *
 * All SQL schema changes should be done with newly added migration entries in the given config, along
 * with a higher `idMonotonicInc`.
 *
 * Running `runAll()` multiple times is safe, and returns early if the migrations array has no changes,
 * therefore it's recommended to always run it before your Durable Object instance is going to read or
 * write into the SQLite database, or at least run it once in the constructor of your DO.
 */
export class SQLSchemaMigrations {
	#_config: SQLSchemaMigrationsConfig;
	#_migrations: SQLSchemaMigration[];

	#_lastMigrationMonotonicId: number = -1;

	constructor(config: SQLSchemaMigrationsConfig) {
		this.#_config = config;

		const migrations = [...config.migrations];
		migrations.sort((a, b) => a.idMonotonicInc - b.idMonotonicInc);
		const idSeen = new Set<number>();
		migrations.forEach((m) => {
			if (m.idMonotonicInc < 0) {
				throw new Error(`migration ID cannot be negative: ${m.idMonotonicInc}`);
			}
			if (idSeen.has(m.idMonotonicInc)) {
				throw new Error(`duplicate migration ID detected: ${m.idMonotonicInc}`);
			}
			idSeen.add(m.idMonotonicInc);
		});

		this.#_migrations = migrations;

		// TODO Should we load the `_lastMigrationMonotonicId` from storage here?
		//      Without loading it, `hasMigrationsToRun()` will always return true until `runAll()` runs once.
		//      That's not bad per se, since everyone should `runAll()` as soon as they need their storage
		//      to be writeable.
		//      Also, if we want to do this, we cannot do it here, since we need to be within `async` function. :(
	}

	/**
	 * This is a quick check based on the in memory tracker of last migration ran,
	 * therefore this always returns `true` until `runAll` runs at least once.
	 * @returns `true` if the `migrations` list provided has not been ran in full yet.
	 */
	hasMigrationsToRun() {
		if (!this.#_migrations.length) {
			return false;
		}
		return (
			this.#_lastMigrationMonotonicId !==
			this.#_migrations[this.#_migrations.length - 1].idMonotonicInc
		);
	}

	/**
	 * Runs all the migrations that haven't already ran. The `idMonotonicInc` of each migration is used
	 * to track which migrations ran or not. New migrations should always have higher `idMonotonicInc`
	 * than older ones!
	 *
	 * @param sqlGen An optional callback function to generate the SQL statement of a given migration at runtime.
	 *               If the migration entry already has a valid `sql` statement this callback is NOT called.
	 * @returns The numbers of rows read and written throughout the migration execution.
	 */
	async runAll(
		sqlGen?: (idMonotonicInc: number) => string
	): Promise<{ rowsRead: number; rowsWritten: number }> {
		const result = {
			rowsRead: 0,
			rowsWritten: 0,
		};

		if (!this.hasMigrationsToRun()) {
			return result;
		}

		this.#_lastMigrationMonotonicId =
			(await this.#_config.doStorage.get<number>(
				this.#_lastMigrationIDKeyName()
			)) ?? -1;

		// Skip all the applied ones.
		let idx = 0,
			sz = this.#_migrations.length;
		while (
			idx < sz &&
			this.#_migrations[idx].idMonotonicInc <= this.#_lastMigrationMonotonicId
		) {
			idx += 1;
		}

		// Make sure we still have migrations to run.
		if (idx >= sz) {
			return result;
		}

		const doSql = this.#_config.doStorage.sql;
		const migrationsToRun = this.#_migrations.slice(idx);

		await this.#_config.doStorage.transaction(async () => {
			let _lastMigrationMonotonicId = this.#_lastMigrationMonotonicId;

			migrationsToRun.forEach((migration) => {
				const query = migration.sql ?? sqlGen?.(migration.idMonotonicInc);
				if (!query) {
					throw new Error(
						`migration with neither 'sql' nor 'sqlGen' provided: ${migration.idMonotonicInc}`
					);
				}

				const cursor = doSql.exec(query);
				const _ = cursor.toArray();

				result.rowsRead += cursor.rowsRead;
				result.rowsWritten += cursor.rowsWritten;

				_lastMigrationMonotonicId = migration.idMonotonicInc;
			});

			this.#_lastMigrationMonotonicId = _lastMigrationMonotonicId;

			await this.#_config.doStorage.put<number>(
				this.#_lastMigrationIDKeyName(),
				this.#_lastMigrationMonotonicId
			);
		});

		return result;
	}

	#_lastMigrationIDKeyName() {
		return "__sql_migrations_lastID";
	}
}
