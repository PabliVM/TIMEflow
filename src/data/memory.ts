import type { Snapshot } from '@/domain/types';
import { applyOps } from './repository';
import type { Op, Repository } from './repository';

/** Respaldo cuando IndexedDB no está disponible (los datos no sobreviven a la recarga). */
export class MemoryRepository implements Repository {
  readonly kind = 'memory';
  private data: Snapshot | null = null;

  async loadAll() {
    return this.data ? structuredClone(this.data) : null;
  }

  async apply(ops: Op[]) {
    if (this.data) this.data = applyOps(this.data, structuredClone(ops));
  }

  async replaceAll(s: Snapshot) {
    this.data = structuredClone(s);
  }
}
