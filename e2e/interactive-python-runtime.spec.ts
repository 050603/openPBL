import { expect, test } from '@playwright/test';
import { patchHtmlForIframe } from '../src/lib/openmaic/utils/iframe';

test('repairs a persisted Python interaction that omitted the Pyodide loader', async ({ page }) => {
  test.setTimeout(60_000);
  const runtimeRequests: string[] = [];
  page.on('console', (message) => runtimeRequests.push(`CONSOLE ${message.type()}: ${message.text()}`));
  page.on('pageerror', (error) => runtimeRequests.push(`PAGEERROR ${error.message}`));
  page.on('response', (response) => {
    if (response.url().includes('/api/openmaic/interactive-runtime/')) {
      runtimeRequests.push(`${response.status()} ${response.url()}`);
    }
  });
  page.on('requestfailed', (request) => {
    if (request.url().includes('/api/openmaic/interactive-runtime/')) {
      runtimeRequests.push(`FAILED ${request.url()}: ${request.failure()?.errorText ?? 'unknown'}`);
    }
  });
  // The reused local server can be an older production build whose response
  // predates the `wasm-unsafe-eval` policy added by this change. Bypass that
  // response policy here; src/next-config.test.ts verifies the new production
  // header, while this browser test verifies the actual loader/WASM/stdlib path.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Page.setBypassCSP', { enabled: true });
  await page.goto('/');

  const generatedHtml = `<!doctype html><html><head></head><body><script>
    (async function () {
      try {
        window.parent.postMessage({ runtimeStage: 'before-load' }, '*');
        var pyodide = await loadPyodide();
        window.parent.postMessage({ runtimeStage: 'after-load' }, '*');
        var value = pyodide.runPython('6 * 7');
        window.parent.postMessage({ runtimeStage: 'after-run' }, '*');
        window.parent.postMessage({ runtimeProbe: true, value: value }, '*');
      } catch (error) {
        window.parent.postMessage({
          runtimeProbe: true,
          error: String(error && error.message || error)
        }, '*');
      }
    })();
  </script></body></html>`;

  const result = await page.evaluate(
    (srcdoc) =>
      new Promise<{ value?: number; error?: string; diagnostics?: string[] }>((resolve) => {
        const diagnostics: string[] = [];
        const timeout = window.setTimeout(
          () => resolve({ error: 'browser probe timed out', diagnostics }),
          45_000,
        );
        const onMessage = (event: MessageEvent) => {
          const data = event.data as {
            runtimeProbe?: boolean;
            runtimeStage?: string;
            value?: number;
            error?: string;
            __maicInteractive?: boolean;
            kind?: string;
            errorKind?: string;
            message?: string;
          };
          if (typeof data?.runtimeStage === 'string') {
            diagnostics.push(data.runtimeStage);
            return;
          }
          if (data?.__maicInteractive === true && data.kind === 'runtime-error') {
            diagnostics.push(`[${data.errorKind ?? 'error'}] ${data.message ?? ''}`);
            return;
          }
          if (!data || data.runtimeProbe !== true) return;
          window.removeEventListener('message', onMessage);
          window.clearTimeout(timeout);
          resolve(data);
        };
        window.addEventListener('message', onMessage);
        const iframe = document.createElement('iframe');
        iframe.setAttribute('sandbox', 'allow-scripts');
        iframe.srcdoc = srcdoc;
        document.body.appendChild(iframe);
      }),
    patchHtmlForIframe(generatedHtml),
  );

  expect(result, [...runtimeRequests, ...(result.diagnostics ?? [])].join('\n')).toEqual({
    runtimeProbe: true,
    value: 42,
  });
});
