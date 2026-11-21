import type { ReleaseAttempt, ReleaseLease } from "./leashes";

/** Reserve all world owners before asking the one receiver to publish. Factories are lazy and ordered. */
export function combineReleaseAttempts(factories: readonly (() => ReleaseAttempt)[]): ReleaseAttempt {
  const leases: ReleaseLease[] = [];
  let finished = false;
  const cancel = () => {
    if (finished) return;
    finished = true;
    for (const lease of leases) { try { lease.cancel(); } catch { /* Cancel every reservation. */ } }
  };
  try {
    for (const factory of factories) {
      const attempt = factory();
      if (attempt.kind === "refused") { cancel(); return attempt; }
      if (attempt.kind === "ready") leases.push(attempt.lease);
    }
    if (!leases.length) return { kind: "none" };
    // Snapshot before publication: later getters may never execute after a receiver commits.
    const stacks = leases.flatMap(l => l.refundStacks.map(s => ({ ...s })));
    const lease: ReleaseLease = {
      get refundStacks() { return stacks.map(s => ({ ...s })); },
      valid: () => {
        if (finished) return false;
        try { return leases.every(l => l.valid()); } catch { return false; }
      },
      consumeAfterReceiverCommit: () => {
        if (finished) return;
        // These are trusted store assignment-only methods, never external callbacks.
        for (const l of leases) l.consumeAfterReceiverCommit();
        cancel();
      },
      cancel,
    };
    return { kind: "ready", lease };
  } catch { cancel(); return { kind: "refused", reason: "Cannot reserve joint world ownership" }; }
}
