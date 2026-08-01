import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_MAX_PHOTO_SIZE_BYTES,
  formatPhotoUploadSize,
  getPhotoSizeError,
  uploadPhotoFiles
} from './photoUpload';

type Listener = (event: { lengthComputable?: boolean; loaded?: number; total?: number }) => void;

class FakeEventTarget {
  listeners = new Map<string, Listener[]>();

  addEventListener(type: string, listener: Listener) {
    this.listeners.set(type, [...(this.listeners.get(type) || []), listener]);
  }

  emit(type: string, event = {}) {
    this.listeners.get(type)?.forEach((listener) => listener(event));
  }
}

class FakeXMLHttpRequest extends FakeEventTarget {
  static latest: FakeXMLHttpRequest;

  upload = new FakeEventTarget();
  status = 0;
  responseText = '';
  method = '';
  url = '';
  headers = new Map<string, string>();
  body: Document | XMLHttpRequestBodyInit | null = null;

  constructor() {
    super();
    FakeXMLHttpRequest.latest = this;
  }

  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }

  setRequestHeader(name: string, value: string) {
    this.headers.set(name, value);
  }

  send(body: Document | XMLHttpRequestBodyInit | null) {
    this.body = body;
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('photo upload validation', () => {
  it('accepts photos at or below the size limit', () => {
    expect(getPhotoSizeError([
      { name: 'photo.jpg', size: DEFAULT_MAX_PHOTO_SIZE_BYTES }
    ])).toBeNull();
  });

  it('names every photo that exceeds the size limit', () => {
    expect(getPhotoSizeError([
      { name: 'small.jpg', size: 2 * 1024 * 1024 },
      { name: 'large.jpg', size: 26 * 1024 * 1024 },
      { name: 'larger.jpg', size: 30.5 * 1024 * 1024 }
    ])).toBe('large.jpg (26.0 MB), larger.jpg (30.5 MB) are over the 25 MB limit.');
  });

  it('formats the selected upload size for feedback', () => {
    expect(formatPhotoUploadSize(640 * 1024)).toBe('640 KB');
    expect(formatPhotoUploadSize(2.25 * 1024 * 1024)).toBe('2.3 MB');
  });

  it('reports transfer and processing progress during an upload', async () => {
    vi.stubGlobal('XMLHttpRequest', FakeXMLHttpRequest);
    const statuses: Array<{ stage: string; progress: number }> = [];
    const upload = uploadPhotoFiles(
      [new File(['photo'], 'photo.jpg', { type: 'image/jpeg' })],
      'secret',
      (status) => statuses.push(status)
    );
    const request = FakeXMLHttpRequest.latest;

    expect(request.method).toBe('POST');
    expect(request.url).toBe('/api/photos');
    expect(request.headers.get('Authorization')).toBe('Bearer secret');
    expect(request.body).toBeInstanceOf(FormData);

    request.upload.emit('progress', { lengthComputable: true, loaded: 3, total: 10 });
    request.upload.emit('load');
    request.status = 201;
    request.emit('load');
    await upload;

    expect(statuses).toEqual([
      { stage: 'uploading', progress: 0 },
      { stage: 'uploading', progress: 30 },
      { stage: 'processing', progress: 100 }
    ]);
  });

  it('returns the server upload error', async () => {
    vi.stubGlobal('XMLHttpRequest', FakeXMLHttpRequest);
    const upload = uploadPhotoFiles(
      [new File(['photo'], 'photo.jpg', { type: 'image/jpeg' })],
      'secret',
      () => undefined
    );
    const request = FakeXMLHttpRequest.latest;

    request.status = 413;
    request.responseText = JSON.stringify({ error: 'Photo is too large.' });
    request.emit('load');

    await expect(upload).rejects.toThrow('Photo is too large.');
  });
});
