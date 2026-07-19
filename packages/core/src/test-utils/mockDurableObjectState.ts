import { vi } from "vitest";

function createMockSqlCursor(rows: any[] = [], columnNames: string[] = []): any {
  let index = 0;
  return {
    [Symbol.iterator]() {
      return this;
    },
    next() {
      if (index < rows.length) {
        return { done: false, value: rows[index++] };
      }
      return { done: true, value: undefined };
    },
    toArray() {
      return rows;
    },
    raw() {
      return this;
    },
    get columnNames() {
      return columnNames;
    },
    get rowsRead() {
      return rows.length;
    },
    get rowsWritten() {
      return 0;
    },
    get remaining() {
      return Math.max(0, rows.length - index);
    },
  };
}

function createMockSqlStorage(): any {
  return {
    exec: vi.fn((_query: string, ..._bindings: any[]) => createMockSqlCursor([])),
    batch: vi.fn().mockResolvedValue([]),
    transaction: vi.fn().mockImplementation(async (closure) => {
      return closure(createMockSqlStorage());
    }),
  };
}

function createMockStorage(): any {
  return {
    get: vi.fn().mockResolvedValue(undefined),
    getMultiple: vi.fn().mockResolvedValue(new Map()),
    put: vi.fn().mockResolvedValue(undefined),
    putMultiple: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    deleteMultiple: vi.fn().mockResolvedValue(undefined),
    deleteAll: vi.fn().mockResolvedValue(undefined),
    list: vi.fn().mockResolvedValue(new Map()),
    getAlarm: vi.fn().mockResolvedValue(undefined),
    setAlarm: vi.fn().mockResolvedValue(undefined),
    deleteAlarm: vi.fn().mockResolvedValue(undefined),
    sync: vi.fn().mockResolvedValue(undefined),
    transaction: vi.fn().mockImplementation(async (closure) => {
      return closure(createMockStorage());
    }),
    sql: createMockSqlStorage(),
  };
}

export function createDurableObjectStateMock(custom: any = {}): any {
  const id = {
    toString: () => "mock-durable-object-id",
    equals: () => false,
    name: undefined,
  };

  return {
    id,
    waitUntil: vi.fn((promise: Promise<any>) => promise),
    blockConcurrencyWhile: vi.fn(async (callback: () => Promise<any>) => {
      return callback();
    }),
    storage: createMockStorage(),
    getWebSockets: vi.fn().mockReturnValue([]),
    acceptWebSocket: vi.fn().mockResolvedValue(undefined),
    setWebSocketAutoResponse: vi.fn(),
    getWebSocketAutoResponse: vi.fn().mockReturnValue(undefined),
    setHibernatableWebSocketEventTimeout: vi.fn(),
    getHibernatableWebSocketEventTimeout: vi.fn().mockReturnValue(null),
    webSocketAutoResponseTimestamp: -1,
    getTags: vi.fn().mockReturnValue([]),
    ...custom,
  };
}
