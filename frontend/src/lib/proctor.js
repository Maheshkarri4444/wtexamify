// Browser-side proctoring helpers: environment checks, entire-screen sharing and fullscreen.

export function checkEnvironment() {
  const ua = navigator.userAgent;
  const brands = navigator.userAgentData?.brands?.map((b) => b.brand) ?? [];
  const mobile = navigator.userAgentData?.mobile ?? /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
  const chromium = brands.length ? brands.some((b) => /Chromium|Google Chrome|Microsoft Edge/i.test(b)) : /Chrome\/|Edg\//.test(ua);
  return {
    mobile,
    chromium,
    canShare: Boolean(navigator.mediaDevices?.getDisplayMedia),
    canFullscreen: Boolean(document.documentElement.requestFullscreen),
    // Chrome and Edge report a second monitor here without asking permission.
    extendedDisplay: window.screen?.isExtended === true,
  };
}

/** Asks for the entire screen and rejects a window or tab, so nothing stays off camera. */
export async function shareEntireScreen() {
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: { displaySurface: "monitor", frameRate: { ideal: 5, max: 10 } },
    audio: false,
    monitorTypeSurfaces: "include",
    selfBrowserSurface: "exclude",
    surfaceSwitching: "exclude",
    preferCurrentTab: false,
  });
  const surface = stream.getVideoTracks()[0]?.getSettings?.().displaySurface;
  if (surface && surface !== "monitor") {
    stream.getTracks().forEach((track) => track.stop());
    throw new Error("Choose “Entire screen”, not a window or a tab.");
  }
  return stream;
}

export const isFullscreen = () => Boolean(document.fullscreenElement);

// Some embedded browsers never settle a fullscreen request; don't leave the student waiting on it.
const withTimeout = (promise, ms, message) =>
  Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error(message)), ms))]);

export async function enterFullscreen() {
  if (!document.fullscreenElement) {
    await withTimeout(document.documentElement.requestFullscreen({ navigationUI: "hide" }), 4000, "Fullscreen didn't turn on.");
  }
  // In Chrome, locking Escape means it has to be held down to leave fullscreen, so a stray tap doesn't.
  // Not awaited: where keyboard lock isn't available, fullscreen still works.
  navigator.keyboard?.lock?.(["Escape"])?.catch(() => {});
}

export async function exitFullscreen() {
  try {
    navigator.keyboard?.unlock?.();
  } catch {
    // Nothing to release.
  }
  if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
}

export const stopStream = (stream) => stream?.getTracks().forEach((track) => track.stop());

export const isStreamLive = (stream) => Boolean(stream?.getVideoTracks().some((track) => track.readyState === "live"));
