/**
 * Image Compressor Utility
 * Compresses uploaded images using HTML5 Canvas to lightweight base64 strings.
 * Keeps IndexedDB storage footprint minimal and fast.
 */

export async function compressImageToBase64(file, maxWidth = 600, maxHeight = 600, quality = 0.75) {
  if (!file) return null;
  if (!file.type.startsWith('image/')) {
    throw new Error('الملف المرفوع يجب أن يكون صورة بصيغة صالحة (JPG, PNG, WebP)');
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('فشل في قراءة ملف الصورة'));
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error('فشل في معالجة أبعاد الصورة'));
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > maxWidth || height > maxHeight) {
          if (width > height) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          } else {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          return resolve(e.target.result); // Fallback to raw if canvas context is unavailable
        }

        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        const compressedBase64 = canvas.toDataURL('image/jpeg', quality);
        resolve(compressedBase64);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

export default compressImageToBase64;
