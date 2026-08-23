import { describe, expect, it } from 'vitest';
import nextConfig from '../next.config';

describe('Content Security Policy', () => {
  it('allows the WebAssembly compilation required by Python interactions', async () => {
    const routeHeaders = await nextConfig.headers?.();
    const contentSecurityPolicy = routeHeaders
      ?.flatMap((route) => route.headers)
      .find((header) => header.key === 'Content-Security-Policy')?.value;

    expect(contentSecurityPolicy).toContain("script-src 'self' 'unsafe-inline'");
    expect(contentSecurityPolicy).toContain("'wasm-unsafe-eval'");
  });

  it('traces all nested interactive runtime assets into standalone builds', () => {
    expect(nextConfig.outputFileTracingIncludes).toMatchObject({
      '/api/openmaic/interactive-runtime/**': expect.arrayContaining([
        './node_modules/codemirror/**/*',
        './node_modules/katex/dist/**/*',
        './node_modules/pyodide/**/*',
      ]),
    });
  });
});
