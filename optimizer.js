/**
 * optimizer.js - Motor de Optimización y Compresión Automática en el Cliente
 * Convierte imágenes a WebP, limita resolución a 1600px máx, aplica compresión
 * de calidad 82% (80-85%) y genera miniaturas (thumbnails) automáticas.
 * Procesa también archivos de video locales para la galería.
 */

class ImageOptimizer {
  /**
   * Comprime y optimiza un archivo de imagen en el navegador mediante HTML5 Canvas
   * @param {File|Blob} file 
   * @returns {Promise<{ full: string, thumb: string, originalSize: number, compressedSize: number, name: string }>}
   */
  static async compressImage(file, options = {}) {
    return new Promise((resolve, reject) => {
      if (!file || !file.type.startsWith('image/')) {
        return reject(new Error('El archivo no es una imagen válida.'));
      }

      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Error al leer el archivo de imagen.'));

      reader.onload = (e) => {
        // Si es un archivo SVG o ICO, conservar directamente el DataURL original sin rasterizar para no perder calidad ni transparencia
        if (file.type === 'image/svg+xml' || file.type === 'image/x-icon' || file.type === 'image/vnd.microsoft.icon') {
          return resolve({
            full: e.target.result,
            thumb: e.target.result,
            originalSize: file.size,
            compressedSize: file.size,
            name: file.name,
            dimensions: 'vector'
          });
        }

        const img = new Image();
        img.onerror = () => reject(new Error('Error al decodificar la imagen.'));

        img.onload = () => {
          try {
            const originalWidth = img.naturalWidth || img.width || 400;
            const originalHeight = img.naturalHeight || img.height || 400;

            // 1. Escalar imagen principal con límite de 1600px en el lado más largo (o maxDim personalizado)
            const MAX_DIM = options.maxDim || 1600;
            let targetWidth = originalWidth;
            let targetHeight = originalHeight;

            if (targetWidth > MAX_DIM || targetHeight > MAX_DIM) {
              if (targetWidth >= targetHeight) {
                targetHeight = Math.round((targetHeight * MAX_DIM) / targetWidth);
                targetWidth = MAX_DIM;
              } else {
                targetWidth = Math.round((targetWidth * MAX_DIM) / targetHeight);
                targetHeight = MAX_DIM;
              }
            }

            const canvas = document.createElement('canvas');
            canvas.width = targetWidth;
            canvas.height = targetHeight;
            const ctx = canvas.getContext('2d', { alpha: true });
            ctx.clearRect(0, 0, targetWidth, targetHeight);
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

            const preserveAlpha = options.preserveAlpha || file.type === 'image/png' || file.type === 'image/webp' || file.type === 'image/gif';

            // Compresión WebP al 82% (dentro del rango 80-85% solicitado)
            let fullWebP = canvas.toDataURL('image/webp', 0.82);

            // Fallback a PNG (si requiere transparencia) o JPEG si el navegador no soporta exportación WebP
            if (!fullWebP.startsWith('data:image/webp')) {
              fullWebP = preserveAlpha
                ? canvas.toDataURL('image/png')
                : canvas.toDataURL('image/jpeg', 0.82);
            }

            // 2. Generar Miniatura (Thumbnail) ligera de 400px máx para cuadrículas
            const THUMB_DIM = options.thumbDim || 400;
            let thumbWidth = originalWidth;
            let thumbHeight = originalHeight;

            if (thumbWidth > THUMB_DIM || thumbHeight > THUMB_DIM) {
              if (thumbWidth >= thumbHeight) {
                thumbHeight = Math.round((thumbHeight * THUMB_DIM) / thumbWidth);
                thumbWidth = THUMB_DIM;
              } else {
                thumbWidth = Math.round((thumbWidth * THUMB_DIM) / thumbHeight);
                thumbHeight = THUMB_DIM;
              }
            }

            const thumbCanvas = document.createElement('canvas');
            thumbCanvas.width = thumbWidth;
            thumbCanvas.height = thumbHeight;
            const thumbCtx = thumbCanvas.getContext('2d', { alpha: true });
            thumbCtx.clearRect(0, 0, thumbWidth, thumbHeight);
            thumbCtx.imageSmoothingEnabled = true;
            thumbCtx.imageSmoothingQuality = 'medium';
            thumbCtx.drawImage(img, 0, 0, thumbWidth, thumbHeight);

            let thumbWebP = thumbCanvas.toDataURL('image/webp', 0.78);
            if (!thumbWebP.startsWith('data:image/webp')) {
              thumbWebP = preserveAlpha
                ? thumbCanvas.toDataURL('image/png')
                : thumbCanvas.toDataURL('image/jpeg', 0.78);
            }

            // Calcular tamaño aproximado resultante
            const compressedBytes = Math.round((fullWebP.length * 3) / 4);

            resolve({
              full: fullWebP,
              thumb: thumbWebP,
              originalSize: file.size,
              compressedSize: compressedBytes,
              name: file.name,
              dimensions: `${targetWidth}x${targetHeight}`
            });
          } catch (err) {
            reject(err);
          }
        };

        img.src = e.target.result;
      };

      reader.readAsDataURL(file);
    });
  }

  /**
   * Procesa archivo de video local y lo lee como Base64 / Blob URL
   * @param {File} file 
   * @returns {Promise<{ url: string, type: 'video', name: string, size: number }>}
   */
  static async processVideo(file) {
    return new Promise((resolve, reject) => {
      if (!file || !file.type.startsWith('video/')) {
        return reject(new Error('El archivo no es un video válido.'));
      }

      // Advertencia de tamaño si supera los 25MB para no saturar memoria
      if (file.size > 25 * 1024 * 1024) {
        alert('Aviso: El video supera 25MB. Se recomienda optimizarlo antes para mayor velocidad de carga.');
      }

      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Error al leer el archivo de video.'));

      reader.onload = (e) => {
        resolve({
          url: e.target.result,
          type: 'video',
          name: file.name,
          size: file.size
        });
      };

      reader.readAsDataURL(file);
    });
  }

  /**
   * Conecta un contenedor drag & drop con su input de archivo correspondiente
   */
  static setupDropZone(dropZoneEl, fileInputEl, onFilesSelected) {
    if (!dropZoneEl || !fileInputEl) return;

    ['dragenter', 'dragover'].forEach(eventName => {
      dropZoneEl.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZoneEl.classList.add('drag-over');
      }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
      dropZoneEl.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZoneEl.classList.remove('drag-over');
      }, false);
    });

    dropZoneEl.addEventListener('drop', (e) => {
      const dt = e.dataTransfer;
      const files = dt ? Array.from(dt.files) : [];
      if (files.length > 0 && onFilesSelected) {
        onFilesSelected(files);
      }
    });

    dropZoneEl.addEventListener('click', (e) => {
      if (e.target.tagName !== 'BUTTON' && e.target.tagName !== 'A') {
        fileInputEl.click();
      }
    });

    fileInputEl.addEventListener('change', (e) => {
      const files = e.target.files ? Array.from(e.target.files) : [];
      if (files.length > 0 && onFilesSelected) {
        onFilesSelected(files);
      }
      e.target.value = ''; // Reset para permitir volver a seleccionar el mismo archivo
    });
  }
}

window.ImageOptimizer = ImageOptimizer;
