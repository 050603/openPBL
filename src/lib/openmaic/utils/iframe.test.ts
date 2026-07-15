import { describe, expect, it } from 'vitest';
import { patchHtmlForIframe } from './iframe';

describe('patchHtmlForIframe activity bridge', () => {
  it('exposes an explicit completion/reset API before generated page scripts', () => {
    const html = '<html><head></head><body><script>window.generatedPageLoaded = true;</script></body></html>';
    const patched = patchHtmlForIframe(html);

    expect(patched).toContain('window.__maicActivity');
    expect(patched).toContain("complete: function () { postActivity('activity-complete'); }");
    expect(patched).toContain("reset: function () { postActivity('activity-reset'); }");
    expect(patched.indexOf('window.__maicActivity')).toBeLessThan(
      patched.indexOf('window.generatedPageLoaded'),
    );
  });

  it('keeps declarative completion and reset controls as compatibility fallbacks', () => {
    const patched = patchHtmlForIframe('<main></main>');

    expect(patched).toContain('[data-activity-complete]');
    expect(patched).toContain('[data-activity-reset]');
    expect(patched).toContain("postActivity('activity-complete')");
    expect(patched).toContain("postActivity('activity-reset')");
  });

  it('does not treat an arbitrary form submission or answer check as mastery', () => {
    const patched = patchHtmlForIframe('<form><button type="submit">Check</button></form>');

    expect(patched).not.toContain('button[type="submit"]');
    expect(patched).not.toContain('#check-answer');
    expect(patched).not.toContain("document.addEventListener('submit'");
  });
});
