import { describe, expect, it } from 'vitest';

import { DEFAULT_MAX_PHOTO_SIZE_BYTES, getPhotoSizeError } from './photoUpload';

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
});
