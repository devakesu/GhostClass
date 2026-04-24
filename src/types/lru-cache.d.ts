declare module 'lru-cache' {
  export class LRUCache<K = any, V = any> {
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
    readonly size: number;
  }
}
