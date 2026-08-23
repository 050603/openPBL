export type DeviceAccessSignals = {
  userAgent?: string;
  platform?: string;
  maxTouchPoints?: number;
  mobile?: boolean;
};

const MOBILE_OR_TABLET_USER_AGENT =
  /Android|webOS|iPhone|iPod|iPad|BlackBerry|IEMobile|Opera Mini|Mobile|Tablet|Silk|Kindle|PlayBook/i;

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
  mobile = false,
}: DeviceAccessSignals): boolean {
  if (mobile || MOBILE_OR_TABLET_USER_AGENT.test(userAgent)) return true;
  return /^Mac/i.test(platform) && maxTouchPoints > 1;
}

