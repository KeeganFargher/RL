import { ReplayDataset } from "../training/types.js";

export class ReplayLoader {
  async load(url: string): Promise<ReplayDataset> {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Failed to load replay from ${url}: ${res.statusText}`);
    }
    return (await res.json()) as ReplayDataset;
  }

  async loadFromFile(file: File): Promise<ReplayDataset> {
    const text = await file.text();
    return JSON.parse(text) as ReplayDataset;
  }
}
