import { describe, expect, it } from 'vitest';
import { resolveProxyUrl } from './proxy-fetch';

describe('proxy fetch configuration', () => {
  it('prefers the media-scoped outbound proxy', () => {
    expect(resolveProxyUrl({
      OPENPBL_OUTBOUND_PROXY: 'http://media-proxy.internal:8080',
      HTTPS_PROXY: 'http://global-proxy.internal:8080',
    })).toBe('http://media-proxy.internal:8080');
  });

  it('keeps supporting standard proxy environment variables', () => {
    expect(resolveProxyUrl({ HTTPS_PROXY: 'http://proxy.internal:8080' }))
      .toBe('http://proxy.internal:8080');
  });

  it('returns undefined when no proxy is configured', () => {
    expect(resolveProxyUrl({})).toBeUndefined();
  });
});
