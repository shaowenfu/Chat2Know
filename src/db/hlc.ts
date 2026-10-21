/**
 * Hybrid logical clock. Timestamps are strings that sort lexicographically in
 * causal order: `<13-digit ms>:<4-char base36 counter>:<deviceId>`.
 */
export class Hlc {
  private last = 0;
  private counter = 0;

  constructor(
    readonly deviceId: string,
    private readonly now: () => number = Date.now,
  ) {}

  tick(): string {
    const wall = this.now();
    if (wall > this.last) {
      this.last = wall;
      this.counter = 0;
    } else {
      this.counter++;
    }
    return Hlc.format(this.last, this.counter, this.deviceId);
  }

  /** Merges a remote timestamp so later local ticks sort after it. */
  receive(remote: string): void {
    const [ms, counter] = Hlc.parse(remote);
    const wall = this.now();
    const max = Math.max(wall, this.last, ms);
    if (max === this.last && max === ms) this.counter = Math.max(this.counter, counter) + 1;
    else if (max === this.last) this.counter++;
    else if (max === ms) this.counter = counter + 1;
    else this.counter = 0;
    this.last = max;
  }

  static format(ms: number, counter: number, deviceId: string): string {
    return `${String(ms).padStart(13, '0')}:${counter.toString(36).padStart(4, '0')}:${deviceId}`;
  }

  static parse(ts: string): [number, number] {
    const [ms, counter] = ts.split(':');
    return [Number(ms), parseInt(counter ?? '0', 36)];
  }
}
