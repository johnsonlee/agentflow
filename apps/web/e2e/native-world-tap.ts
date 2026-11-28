import { test, type Page, type CDPSession } from '@playwright/test';

export interface NativeTapReceipt {
  command: 'Input.synthesizeTapGesture';
  parameters: { x: number; y: number; duration: number; tapCount: number; gestureSourceType: 'touch' };
  acknowledged: boolean;
  cancellationAcknowledged: boolean | null;
}
export class NativeTapFailure extends Error {
  constructor(readonly receipt: NativeTapReceipt, cause: unknown) { super('Native touch gesture failed; no replay', { cause }); }
}
/** One native browser gesture controls contact duration without an RPC between down/up.
 * An acknowledgement is transport evidence only; callers separately assert real pointer phases and outcomes. */
export async function nativeWorldTap(session: CDPSession, x: number, y: number): Promise<NativeTapReceipt> {
  if (![x, y].every(Number.isFinite) || x < 0 || y < 0) throw Error('Invalid native tap coordinates');
  const receipt: NativeTapReceipt = { command: 'Input.synthesizeTapGesture',
    parameters: { x, y, duration: 50, tapCount: 1, gestureSourceType: 'touch' }, acknowledged: false, cancellationAcknowledged: null };
  try { await session.send(receipt.command, receipt.parameters); receipt.acknowledged = true; return receipt; }
  catch (cause) {
    try { await session.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] }); receipt.cancellationAcknowledged = true; }
    catch { receipt.cancellationAcknowledged = false; }
    throw new NativeTapFailure(receipt, cause);
  }
}
export interface NativeTapEvent { phase: string; pointerId: number; pointerType: string; isTrusted: boolean; timeStamp: number; observedAt: number; x: number; y: number; target: string }
/** Read-only native event evidence. Never substitutes requested duration for observed duration. */
export function assertNativeWorldTap(events: readonly NativeTapEvent[], x: number, y: number): void {
  if (events.length !== 2) throw Error('Native tap requires exactly down/up, without cancellation or extra contact');
  const [down, up] = events, duration = up.timeStamp - down.timeStamp;
  if (down.phase !== 'pointerdown' || up.phase !== 'pointerup' || !Number.isSafeInteger(down.pointerId) || down.pointerId < 0 || down.pointerId !== up.pointerId ||
    !events.every(e => e.pointerType === 'touch' && e.isTrusted === true && e.target === 'game-canvas' &&
      [e.x, e.y, e.timeStamp, e.observedAt].every(Number.isFinite) && Math.hypot(e.x - x, e.y - y) < 1) ||
    !Number.isFinite(duration) || duration < 0 || duration >= 300) throw Error('Actual native contact was not a bounded game-canvas tap');
}

/** Every canvas-tap caller gets actual generated-event and processing-time evidence.
 * DOM button taps, intentional mining holds and joystick movement do not use this helper. */
export async function nativePageWorldTap(page: Page, x: number, y: number): Promise<void> {
  const errors: unknown[] = []; let session: CDPSession | null = null, receipt: NativeTapReceipt | null = null;
  let events: NativeTapEvent[] = [], captureStarted = false;
  try {
    await page.evaluate(() => {
      const w = window as unknown as { __nativeWorldTapCapture?: { events: unknown[]; cleanup(): void } };
      if (w.__nativeWorldTapCapture) throw Error('Overlapping native canvas tap capture');
      const events: unknown[] = [];
      const listener = (event: Event) => {
        const e = event as PointerEvent, g = window.__craft.game;
        events.push({ phase: e.type, isTrusted: e.isTrusted, pointerId: e.pointerId, pointerType: e.pointerType,
          timeStamp: e.timeStamp, observedAt: performance.now(), x: e.clientX, y: e.clientY,
          target: (e.target as HTMLElement)?.className,
          selected: g?.inventory.selected, targetBlock: g?.targetBlock ? { ...g.targetBlock } : null,
          placeCooldown: g ? (g as unknown as { placeCooldown: number }).placeCooldown : null });
      };
      for (const phase of ['pointerdown', 'pointerup', 'pointercancel']) window.addEventListener(phase, listener, true);
      w.__nativeWorldTapCapture = { events, cleanup: () => {
        for (const phase of ['pointerdown', 'pointerup', 'pointercancel']) window.removeEventListener(phase, listener, true);
        delete w.__nativeWorldTapCapture;
      } };
    });
    captureStarted = true; session = await page.context().newCDPSession(page);
    receipt = await nativeWorldTap(session, x, y);
  } catch (error) { if (error instanceof NativeTapFailure) receipt = error.receipt; errors.push(error); }
  finally {
    if (captureStarted) try {
      events = await page.evaluate(() => {
        const capture = (window as unknown as { __nativeWorldTapCapture?: { events: NativeTapEvent[]; cleanup(): void } }).__nativeWorldTapCapture;
        if (!capture) throw Error('Lost actual tap capture');
        try { return capture.events; } finally { capture.cleanup(); }
      });
    } catch (error) { errors.push(error); }
    if (session) try { await session.detach(); } catch (error) { errors.push(error); }
    try { if (receipt?.acknowledged) assertNativeWorldTap(events, x, y); } catch (error) { errors.push(error); }
    // An evidence write failure also prevents success. No synthetic event or requested timestamp is accepted as observation.
    await test.info().attach('native-world-tap', { contentType: 'application/json', body: Buffer.from(JSON.stringify({
      receipt, events, errors: errors.map(e => String(e)), replayCount: 0,
      qualification: 'Actual native gesture intent/ack and read-only generated pointer phases. Functional outcome assertions remain separate.' }, null, 2)) });
  }
  if (errors.length) throw new AggregateError(errors, 'Actual native world tap/capture/cleanup failed; no replay');
}
