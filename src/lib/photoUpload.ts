export const DEFAULT_MAX_PHOTO_SIZE_BYTES = 25 * 1024 * 1024;

export type PhotoUploadStatus = {
  stage: 'uploading' | 'processing' | 'refreshing';
  progress: number;
};

export type PhotoUploadStatusListener = (status: PhotoUploadStatus) => void;

const formatMegabytes = (bytes: number) => (bytes / (1024 * 1024)).toFixed(1);

export const getPhotoSizeError = (
  files: Array<Pick<File, 'name' | 'size'>>,
  maxBytes = DEFAULT_MAX_PHOTO_SIZE_BYTES
) => {
  const oversized = files.filter((file) => file.size > maxBytes);
  if (oversized.length === 0) return null;

  const details = oversized
    .map((file) => `${file.name} (${formatMegabytes(file.size)} MB)`)
    .join(', ');
  const maxMegabytes = Math.round(maxBytes / (1024 * 1024));
  return `${details} ${oversized.length === 1 ? 'is' : 'are'} over the ${maxMegabytes} MB limit.`;
};

export const formatPhotoUploadSize = (bytes: number) => {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${formatMegabytes(bytes)} MB`;
};

const getUploadError = (responseText: string, fallback: string) => {
  try {
    const payload = JSON.parse(responseText) as { error?: unknown };
    if (typeof payload.error === 'string' && payload.error.trim()) return payload.error;
  } catch {
    // The server may return an empty or non-JSON response for network-level failures.
  }
  return fallback;
};

export const uploadPhotoFiles = (
  files: File[],
  token: string,
  onStatus: PhotoUploadStatusListener
) => new Promise<void>((resolve, reject) => {
  const formData = new FormData();
  files.forEach((file) => formData.append('files', file));

  const request = new XMLHttpRequest();
  request.open('POST', '/api/photos');
  request.setRequestHeader('Authorization', `Bearer ${token}`);

  request.upload.addEventListener('progress', (event) => {
    if (!event.lengthComputable || event.total === 0) return;
    onStatus({
      stage: 'uploading',
      progress: Math.min(100, Math.round((event.loaded / event.total) * 100))
    });
  });

  request.upload.addEventListener('load', () => {
    onStatus({ stage: 'processing', progress: 100 });
  });

  request.addEventListener('load', () => {
    if (request.status >= 200 && request.status < 300) {
      resolve();
      return;
    }
    reject(new Error(getUploadError(request.responseText, 'Upload failed')));
  });

  request.addEventListener('error', () => {
    reject(new Error('Upload failed. Check the connection and try again.'));
  });

  request.addEventListener('abort', () => {
    reject(new Error('Upload cancelled.'));
  });

  onStatus({ stage: 'uploading', progress: 0 });
  request.send(formData);
});
