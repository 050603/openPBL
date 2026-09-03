export type DeviceAccessSignals = {
  userAgent?: string;
  platform?: string;
  maxTouchPoints?: number;
  mobile?: boolean;
  hasFinePointer?: boolean;
  viewportWidth?: number;
};

const PHONE_USER_AGENT = /webOS|iPhone|iPod|BlackBerry|IEMobile|Opera Mini|Android.+Mobile/i;
const TABLET_USER_AGENT = /iPad|Tablet|Silk|Kindle|PlayBook|Android/i;

/**
 * openPBL's classroom surfaces are intentionally desktop-only. Keep this
 * check independent from viewport width so a resized desktop browser is not
 * mistaken for a phone, while iPadOS' desktop-style user agent is still
 * identified through its touch-capable Mac platform signature.
 */
export function isUnsupportedMobileOrTablet({
  userAgent = "",
  platform = "",
  maxTouchPoints = 0,
  mobile,
  hasFinePointer = false,
  viewportWidth = 0,
}: DeviceAccessSignals): boolean {
  // User-Agent Client Hints are more reliable than legacy UA substrings.
  // Chromium desktop explicitly reports mobile=false, including touch PCs.
  if (mobile === false) return false;
  if (mobile || PHONE_USER_AGENT.test(userAgent)) return true;

  // A fine pointer and a desktop-sized viewport are strong evidence that the
  // full workspace is usable, even when a remote browser exposes touch points
  // or a compatibility UA that resembles a tablet.
  if (hasFinePointer && viewportWidth >= 960) return false;
  if (TABLET_USER_AGENT.test(userAgent)) return true;
  return /^Mac/i.test(platform) && maxTouchPoints > 1 && !hasFinePointer;
}
