/** Device-independent snapshot of the player's intent for one frame. */
export interface InputFrame {
  forward: number;
  strafe: number;
  jump: boolean;
  descend: boolean;
  sprint: boolean;
  /** Camera rotation deltas in radians. */
  lookYaw: number;
  lookPitch: number;
  /** Break is held down (continuous). */
  breaking: boolean;
  /** Place / use was triggered this frame. */
  place: boolean;
  /** Pick-block (middle click) was triggered this frame. */
  pick: boolean;
  /** Toggle flying (double-tap jump or the fly button). */
  toggleFly: boolean;
  /** Hotbar slot selected this frame, or null. */
  hotbarSlot: number | null;
  /** Hotbar scroll direction this frame. */
  hotbarScroll: number;
}

export function emptyFrame(): InputFrame {
  return {
    forward: 0,
    strafe: 0,
    jump: false,
    descend: false,
    sprint: false,
    lookYaw: 0,
    lookPitch: 0,
    breaking: false,
    place: false,
    pick: false,
    toggleFly: false,
    hotbarSlot: null,
    hotbarScroll: 0,
  };
}

/** Combines frames from several sources (e.g. keyboard and touch). */
export function mergeFrames(frames: readonly InputFrame[]): InputFrame {
  const out = emptyFrame();
  for (const f of frames) {
    out.forward += f.forward;
    out.strafe += f.strafe;
    out.jump ||= f.jump;
    out.descend ||= f.descend;
    out.sprint ||= f.sprint;
    out.lookYaw += f.lookYaw;
    out.lookPitch += f.lookPitch;
    out.breaking ||= f.breaking;
    out.place ||= f.place;
    out.pick ||= f.pick;
    out.toggleFly ||= f.toggleFly;
    out.hotbarSlot ??= f.hotbarSlot;
    out.hotbarScroll += f.hotbarScroll;
  }
  out.forward = Math.max(-1, Math.min(1, out.forward));
  out.strafe = Math.max(-1, Math.min(1, out.strafe));
  return out;
}

/** Detects a double press within a time window (used for double-tap-jump to fly). */
export class DoubleTap {
  private last = -Infinity;

  constructor(private readonly windowMs = 300) {}

  press(nowMs: number): boolean {
    const hit = nowMs - this.last <= this.windowMs;
    this.last = hit ? -Infinity : nowMs;
    return hit;
  }
}
