declare module "node:sqlite" {
  export interface StatementSync {
    run(...values: unknown[]): { changes: number; lastInsertRowid: number | bigint };
    get(...values: unknown[]): unknown;
    all(...values: unknown[]): unknown[];
  }

  export class DatabaseSync {
    constructor(path: string);
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
    close(): void;
  }
}
