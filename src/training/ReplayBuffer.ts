import { Experience } from "./types.js";

export class ReplayBuffer {
  private buffer: Experience[] = [];
  private index = 0;
  private readonly capacity: number;

  constructor(capacity: number) {
    this.capacity = capacity;
  }

  add(exp: Experience) {
    if (this.buffer.length < this.capacity) {
      this.buffer.push(exp);
    } else {
      this.buffer[this.index] = exp;
    }
    this.index = (this.index + 1) % this.capacity;
  }

  size(): number {
    return this.buffer.length;
  }

  sample(batchSize: number): Experience[] {
    if (this.buffer.length <= batchSize) {
      return [...this.buffer];
    }
    const samples: Experience[] = [];
    for (let i = 0; i < batchSize; i++) {
      const idx = Math.floor(Math.random() * this.buffer.length);
      samples.push(this.buffer[idx]);
    }
    return samples;
  }
}
