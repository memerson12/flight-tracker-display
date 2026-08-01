export const DEFAULT_MAX_PHOTO_SIZE_BYTES = 25 * 1024 * 1024;

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
