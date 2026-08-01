declare module "lru-cache" {
  export class LRUCache<K = unknown, V = unknown> {
    constructor(options: {
      max: number;
      ttl?: number;
      updateAgeOnGet?: boolean;
      updateAgeOnHas?: boolean;
    });
    get(key: K): V | undefined;
    set(key: K, value: V): void;
    delete(key: K): boolean;
    clear(): void;
    entries(): IterableIterator<[K, V]>;
    readonly size: number;
  }
}
