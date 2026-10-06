/** Fixed-growth object pool to avoid allocations during active gameplay. */
export class Pool<T> {
  private free: T[] = [];
  readonly active: T[] = [];

  constructor(
    private readonly create: () => T,
    private readonly reset: (item: T) => void,
    prewarm = 0,
  ) {
    for (let i = 0; i < prewarm; i++) this.free.push(create());
  }

  acquire(): T {
    const item = this.free.pop() ?? this.create();
    this.active.push(item);
    return item;
  }

  release(item: T): void {
    const idx = this.active.indexOf(item);
    if (idx === -1) return;
    // Swap-remove: order of active items is not significant.
    this.active[idx] = this.active[this.active.length - 1];
    this.active.pop();
    this.reset(item);
    this.free.push(item);
  }

  /** Releases every active item matching the predicate. */
  releaseWhere(predicate: (item: T) => boolean): void {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const item = this.active[i];
      if (predicate(item)) this.release(item);
    }
  }

  releaseAll(): void {
    while (this.active.length) this.release(this.active[this.active.length - 1]);
  }

  get size(): number {
    return this.active.length;
  }

  get freeCount(): number {
    return this.free.length;
  }
}
