const CHECKPOINT_INTERVAL = 64

const noCheckpoint = () => {}

export class CooperativeWork {
  private unitsSinceCheckpoint = 0

  constructor(private readonly checkpoint: () => void = noCheckpoint) {}

  boundary(): void {
    this.unitsSinceCheckpoint = 0
    this.checkpoint()
  }

  item(): void {
    this.unitsSinceCheckpoint += 1
    if (this.unitsSinceCheckpoint < CHECKPOINT_INTERVAL) return
    this.boundary()
  }

  comparator<T>(compare: (left: T, right: T) => number): (left: T, right: T) => number {
    return (left, right) => {
      const result = compare(left, right)
      this.item()
      return result
    }
  }

  finish<T>(result: T): T {
    this.boundary()
    return result
  }
}
