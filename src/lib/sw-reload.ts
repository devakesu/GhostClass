/**
 * sw-reload.ts
 *
 * Smart page reload that applies any waiting service-worker update BEFORE
 * reloading the tab.
 *
 * Problem context
 * ---------------
 * The app uses `skipWaiting: false` in the SW config so that a new service
 * worker never activates mid-session. A user who is still running old code
 * (e.g. after a breaking deploy) will see the "App updated — tap to refresh"
 * toast. If they crash before clicking it, every error-screen "Reload" button
 * previously called `window.location.reload()` directly — which keeps the old
 * SW in control because `SKIP_WAITING` was never sent. The user would reload
 * right back into the same broken JS bundles.
 *
 * Solution
 * --------
 * `reloadWithUpdate()` checks `registration.waiting` first. When a new SW is
 * waiting it sends `SKIP_WAITING`, listens for the resulting `controllerchange`
 * event, and only then reloads — so the fresh code is served. If no update is
 * waiting, or if anything fails, it falls back to a plain `window.location.reload()`.
 *
 * Usage
 * -----
 * Replace every `window.location.reload()` on error screens with this function:
 *
 * ```ts
 * import { reloadWithUpdate } from "@/lib/sw-reload";
 *
 * // in an error boundary / error page button handler:
 * reloadWithUpdate();
 * ```
 */
/**
 * Activates `waitingWorker` by sending SKIP_WAITING, then calls `onReady`
 * once the worker is activated (via controllerchange, statechange, or a 3 s
 * safety-net timeout — whichever fires first).
 *
 * Extracted so both `reloadWithUpdate` and `tryAutoUpdate` can share the
 * same activation flow without duplication.
 */
const ACTIVATION_TIMEOUT_MS = 3000;

function activateAndRun(
  waitingWorker: ServiceWorker,
  onReady: () => void
): void {
  let done = false;
  let activationTimeout: ReturnType<typeof setTimeout> | undefined;
  let controllerChangeHandler: (() => void) | undefined;

  const finish = () => {
    if (!done) {
      done = true;
      clearTimeout(activationTimeout);
      // Remove the controllerchange listener regardless of which path won
      // (statechange, timeout, or controllerchange itself) so it is never
      // left dangling for the rest of the session.
      if (controllerChangeHandler) {
        navigator.serviceWorker.removeEventListener(
          "controllerchange",
          controllerChangeHandler
        );
        controllerChangeHandler = undefined;
      }
      onReady();
    }
  };

  // Primary signal: SW finished claiming the tab.
  // Use a named wrapper so `controllerChangeHandler` can be removed by the
  // statechange/timeout paths even if `once:true` hasn't fired yet.
  const onControllerChange = () => finish();
  controllerChangeHandler = onControllerChange;
  navigator.serviceWorker.addEventListener("controllerchange", onControllerChange, {
    once: true,
  });

  // Secondary signal: waiting worker reached 'activated' state.
  // Fires even when clientsClaim: false (where controllerchange may never
  // fire), ensuring we act only after the new SW is activated so it can
  // take control on the next load.
  waitingWorker.addEventListener("statechange", function onActivated() {
    if (waitingWorker.state === "activated") {
      waitingWorker.removeEventListener("statechange", onActivated);
      finish();
    }
  });

  // Safety net: if neither signal arrives within the timeout, proceed anyway.
  activationTimeout = setTimeout(finish, ACTIVATION_TIMEOUT_MS);

  waitingWorker.postMessage({ type: "SKIP_WAITING" });
}

export function reloadWithUpdate(): void {
  if (typeof window === "undefined") return;

  if (!("serviceWorker" in navigator)) {
    window.location.reload();
    return;
  }

  // Fire-and-forget: the async work happens in the microtask queue; the
  // synchronous part of the calling event handler finishes immediately.
  void (async () => {
    try {
      const registration = await navigator.serviceWorker.getRegistration("/");
      const waitingWorker = registration?.waiting;

      if (!waitingWorker) {
        // No update pending — plain reload.
        window.location.reload();
        return;
      }

      // A new SW is queued. Activate it, then reload.
      activateAndRun(waitingWorker, () => window.location.reload());
    } catch {
      // Any error (getRegistration fails, postMessage fails, etc.) →
      // fall back to a normal reload so the user is never stuck.
      window.location.reload();
    }
  })();
}

/**
 * Automatically applies a waiting SW update and reloads — but only once per
 * browser session, to prevent an infinite reload loop when the new code also
 * crashes.
 *
 * Intended for last-resort error surfaces (e.g. `global-error.tsx`) where the
 * root layout itself has failed and the user is already seeing a broken/blank
 * page. Silent auto-reload is preferable to leaving them stranded there.
 *
 * Flow
 * ----
 * 1. If `sessionStorage` already has the guard key → bail out (don't loop).
 * 2. If no SW is registered or no update is waiting → bail out (nothing to apply).
 * 3. Otherwise: set the guard, send SKIP_WAITING, reload once the new SW activates.
 *
 * The guard is only cleared when the user navigates away or closes the tab
 * (sessionStorage is session-scoped), so repeated crashes in the same session
 * fall through to the normal error UI.
 *
 * Usage
 * -----
 * ```ts
 * import { tryAutoUpdate } from "@/lib/sw-reload";
 *
 * // Inside a useEffect on a last-resort error page:
 * useEffect(() => { tryAutoUpdate(); }, []);
 * ```
 */
const AUTO_UPDATE_GUARD_KEY = "sw-auto-reload-attempted";

export function tryAutoUpdate(): void {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator)) return;

  // Guard: only attempt once per session to prevent reload loops.
  try {
    if (sessionStorage.getItem(AUTO_UPDATE_GUARD_KEY)) return;
  } catch {
    // sessionStorage unavailable (private-browsing restriction, etc.) — bail
    // out rather than risk a loop.
    return;
  }

  void (async () => {
    try {
      const registration = await navigator.serviceWorker.getRegistration("/");
      const waitingWorker = registration?.waiting;

      if (!waitingWorker) {
        // No update pending — leave the error UI visible so the user can act.
        return;
      }

      // Mark so a crash in the fresh code doesn't loop.
      sessionStorage.setItem(AUTO_UPDATE_GUARD_KEY, "1");

      activateAndRun(waitingWorker, () => window.location.reload());
    } catch {
      // Anything fails → leave the error UI visible; don't loop.
    }
  })();
}
