import { describe, expect, it } from 'vitest';
import { GET } from './route';

function request(runtime: string, path: string[]) {
  return GET(new Request('http://localhost/api/openmaic/interactive-runtime/test'), {
    params: Promise.resolve({ runtime, path }),
  });
}

describe('interactive runtime assets', () => {
  it('serves the real same-origin CodeMirror runtime with immutable caching', async () => {
    const response = await request('codemirror', ['lib', 'codemirror.js']);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/javascript');
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
    expect(await response.text()).toContain('CodeMirror');
  });

  it('serves the packaged Pyodide loader and WASM binary', async () => {
    const loader = await request('pyodide', ['pyodide.js']);
    const wasm = await request('pyodide', ['pyodide.asm.wasm']);

    expect(loader.status).toBe(200);
    expect(await loader.text()).toContain('loadPyodide');
    expect(wasm.status).toBe(200);
    expect(wasm.headers.get('content-type')).toBe('application/wasm');
    expect(Number(wasm.headers.get('content-length'))).toBeGreaterThan(1_000_000);
  });

  it('serves KaTeX assets used by generated code explanations', async () => {
    const response = await request('katex', ['contrib', 'auto-render.min.js']);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/javascript');
    expect(await response.text()).toContain('renderMathInElement');
  });

  it('rejects unknown runtimes and unsafe paths', async () => {
    expect((await request('other', ['thing.js'])).status).toBe(404);
    expect((await request('codemirror', ['..', 'package.json'])).status).toBe(400);
    expect((await request('pyodide', ['not-a-real-package.whl'])).status).toBe(404);
  });
});
