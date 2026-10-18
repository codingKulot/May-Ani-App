export interface ImagePayload {
  mediaType: 'image/jpeg';
  /** base64 without the data: prefix */
  data: string;
  /** full data URL for previews */
  dataUrl: string;
  width: number;
  height: number;
}

/** Downscale a user photo to keep uploads small (phone photos are often 5-10 MB). */
export async function fileToImagePayload(file: File, maxDim = 1280, quality = 0.82): Promise<ImagePayload> {
  if (!file.type.startsWith('image/')) throw new Error('Please choose an image file.');
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('That image could not be read. Try a JPG or PNG.'));
      el.src = url;
    });
    const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
    const width = Math.max(1, Math.round(img.naturalWidth * scale));
    const height = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Image processing is not available in this browser.');
    ctx.drawImage(img, 0, 0, width, height);
    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    return { mediaType: 'image/jpeg', data: dataUrl.split(',')[1], dataUrl, width, height };
  } finally {
    URL.revokeObjectURL(url);
  }
}
