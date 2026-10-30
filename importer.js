/**
 * importer.js - Motor de Importación Masiva de Catálogo (Excel .xlsx y .csv)
 * Procesa archivos de hojas de cálculo del lado del cliente, realiza mapeo de columnas,
 * validación de datos y genera una vista previa antes de guardar.
 */

class CatalogImporter {
  constructor(appState) {
    this.appState = appState;
    this.parsedProducts = [];
    this.importErrors = [];
  }

  /**
   * Lee un archivo (.xlsx, .xls o .csv) seleccionado por el administrador
   * @param {File} file
   * @returns {Promise<{success: boolean, products: Array, errors: Array}>}
   */
  async processFile(file) {
    this.parsedProducts = [];
    this.importErrors = [];

    const fileName = file.name.toLowerCase();

    if (fileName.endsWith('.csv')) {
      const text = await file.text();
      return this.parseCSV(text);
    } else if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
      return this.parseExcelWithSheetJS(file);
    } else {
      return {
        success: false,
        products: [],
        errors: ['Formato no soportado. Por favor utiliza archivos .xlsx o .csv.']
      };
    }
  }

  /**
   * Procesa archivo Excel utilizando la biblioteca SheetJS (si está disponible)
   * o realiza un fallback si se trata de un archivo binario.
   */
  async parseExcelWithSheetJS(file) {
    if (typeof XLSX === 'undefined') {
      return {
        success: false,
        products: [],
        errors: ['La librería SheetJS no está cargada. Asegúrate de tener conexión a Internet o utiliza el formato .csv nativo.']
      };
    }

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const rawRows = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

      if (!rawRows || rawRows.length === 0) {
        return {
          success: false,
          products: [],
          errors: ['La hoja de cálculo está vacía o no tiene filas válidas.']
        };
      }

      return this.mapRowsToProducts(rawRows);
    } catch (err) {
      console.error('Error procesando archivo Excel:', err);
      return {
        success: false,
        products: [],
        errors: [`Error al procesar el archivo Excel: ${err.message}`]
      };
    }
  }

  /**
   * Parser nativo de CSV sin dependencias externas
   */
  parseCSV(text) {
    try {
      const lines = text.split(/\r\n|\n/).filter(line => line.trim().length > 0);
      if (lines.length < 2) {
        return {
          success: false,
          products: [],
          errors: ['El archivo CSV debe contener al menos una fila de encabezados y una fila de datos.']
        };
      }

      // Detectar separador (; o ,)
      const headerLine = lines[0];
      const separator = headerLine.includes(';') ? ';' : ',';

      const headers = this.parseCSVLine(headerLine, separator).map(h => h.trim());
      const rawRows = [];

      for (let i = 1; i < lines.length; i++) {
        const rowValues = this.parseCSVLine(lines[i], separator);
        if (rowValues.length === 0 || (rowValues.length === 1 && !rowValues[0])) continue;

        const rowObj = {};
        headers.forEach((header, index) => {
          rowObj[header] = rowValues[index] !== undefined ? rowValues[index].trim() : '';
        });
        rawRows.push(rowObj);
      }

      return this.mapRowsToProducts(rawRows);
    } catch (err) {
      return {
        success: false,
        products: [],
        errors: [`Error al interpretar archivo CSV: ${err.message}`]
      };
    }
  }

  /**
   * Auxiliar para parsear líneas de CSV respetando comillas
   */
  parseCSVLine(text, separator) {
    const result = [];
    let cur = '';
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (c === '"') {
        if (inQuotes && text[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (c === separator && !inQuotes) {
        result.push(cur);
        cur = '';
      } else {
        cur += c;
      }
    }
    result.push(cur);
    return result;
  }

  /**
   * Mapea y normaliza los encabezados a las propiedades de producto.
   * Soporta las nuevas columnas separadas:
   * - "URL Foto de Portada" (imagen principal)
   * - "URLs Fotos de Muestra" (galería secundaria separada por comas)
   * Mantiene retrocompatibilidad total con el formato anterior de columna única multimedia.
   */
  mapRowsToProducts(rawRows) {
    const products = [];
    const errors = [];

    // Normalizador de claves de encabezado (sin acentos, minúsculas, alfanumérico)
    const normalize = str => String(str || '').toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/g, '');

    const parseMediaItem = (urlStr) => {
      const cleanUrl = String(urlStr || '').trim();
      const isVideo = Boolean(cleanUrl.match(/\.(mp4|webm|ogg|mov)($|\?)/i));
      return {
        type: isVideo ? 'video' : 'image',
        url: cleanUrl,
        thumb: cleanUrl
      };
    };

    rawRows.forEach((row, index) => {
      const rowNum = index + 2; // Considerando cabecera en fila 1

      // Mapeo flexible de todos los campos del formulario de producto
      let name = '';
      let sku = '';
      let category = '';
      let basePrice = 0;
      let salePrice = null;
      let badge = '';
      let description = '';
      let coverUrlRaw = '';      // Nueva columna: "URL Foto de Portada"
      let sampleUrlsRaw = '';    // Nueva columna: "URLs Fotos de Muestra"
      let legacyMediaRaw = '';   // Retrocompatibilidad con formato anterior
      let specsRaw = '';
      let tagsRaw = '';

      Object.entries(row).forEach(([colKey, colVal]) => {
        const k = normalize(colKey);
        const val = String(colVal !== undefined && colVal !== null ? colVal : '').trim();
        if (!k) return;

        // 1. Detectar específicamente "URL Foto de Portada" (imagen principal)
        if (
          k.includes('portada') ||
          k.includes('cover') ||
          k.includes('principal') ||
          k === 'urlfotodeportada' ||
          k === 'fotodeportada' ||
          k === 'imagenportada'
        ) {
          coverUrlRaw = val;
        }
        // 2. Detectar específicamente "URLs Fotos de Muestra" (galería secundaria)
        else if (
          k.includes('muestra') ||
          k.includes('galeria') ||
          k.includes('gallery') ||
          k.includes('secundaria') ||
          k.includes('adicional') ||
          k === 'urlsfotosdemuestra' ||
          k === 'fotosdemuestra'
        ) {
          sampleUrlsRaw = val;
        }
        // 3. Título / Nombre del Producto
        else if (k.includes('nombre') || k.includes('titulo') || k.includes('producto') || k === 'name' || k === 'title') {
          name = val;
        }
        // 4. SKU / Código
        else if (k.includes('sku') || k.includes('codigo') || k === 'id' || k === 'referencia') {
          sku = val;
        }
        // 5. Categoría
        else if (k.includes('categoria') || k.includes('rubro') || k === 'category') {
          category = val;
        }
        // 6. Precio de Oferta
        else if (k.includes('oferta') || k.includes('descuento') || k.includes('saleprice') || k.includes('preciorebajado') || k.includes('promo')) {
          const cleanNum = val.replace(/[^0-9.,-]/g, '').replace(',', '.');
          const num = parseFloat(cleanNum);
          if (!isNaN(num) && num > 0) salePrice = num;
        }
        // 7. Precio Base
        else if (k.includes('precio') || k.includes('base') || k === 'price' || k === 'valor') {
          const cleanNum = val.replace(/[^0-9.,-]/g, '').replace(',', '.');
          const num = parseFloat(cleanNum);
          if (!isNaN(num)) basePrice = num;
        }
        // 8. Badge / Etiqueta Destacada
        else if (k.includes('badge') || k === 'etiqueta' || k.includes('destacado') || k.includes('flag')) {
          badge = val;
        }
        // 9. Descripción
        else if (k.includes('desc') || k.includes('detalle') || k.includes('resumen')) {
          description = val;
        }
        // 10. Especificaciones Técnicas (Clave:Valor)
        else if (k.includes('espec') || k.includes('spec') || k.includes('caracteristica') || k.includes('atributo') || k.includes('ficha')) {
          specsRaw = val;
        }
        // 11. Palabras Clave / Tags
        else if (k.includes('tag') || k.includes('palabra') || k.includes('etiquetas') || k.includes('keyword')) {
          tagsRaw = val;
        }
        // 12. Retrocompatibilidad: Columna única de Imágenes / Videos del formato anterior
        else if (k.includes('imagen') || k.includes('foto') || k.includes('media') || k.includes('video') || k === 'image' || k === 'url') {
          legacyMediaRaw = val;
        }
      });

      // Validaciones básicas de fila
      if (!name) {
        errors.push(`Fila ${rowNum}: El nombre o título del producto está vacío.`);
        return;
      }

      if (basePrice <= 0) {
        errors.push(`Fila ${rowNum} (${name}): El precio base debe ser mayor a 0.`);
      }

      // Construcción de Portada (coverImage) y Galería Secundaria (gallery)
      const DEFAULT_PLACEHOLDER = 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800&auto=format&fit=crop&q=80';
      let coverMediaObj = null;
      let galleryList = [];

      if (coverUrlRaw || sampleUrlsRaw) {
        // Nuevo modelo con "URL Foto de Portada" y "URLs Fotos de Muestra" separadas
        if (coverUrlRaw) {
          const firstCoverUrl = coverUrlRaw.split(/[,;\n]/).map(u => u.trim()).filter(Boolean)[0];
          if (firstCoverUrl) {
            coverMediaObj = parseMediaItem(firstCoverUrl);
          }
        }

        if (sampleUrlsRaw) {
          const sampleUrls = sampleUrlsRaw.split(/[,;\n]/).map(u => u.trim()).filter(Boolean);
          galleryList = sampleUrls.map(u => parseMediaItem(u));
        }

        // Si se dejaron URLs de muestra pero la portada quedó vacía, usar la primera o el placeholder
        if (!coverMediaObj) {
          if (galleryList.length > 0) {
            coverMediaObj = galleryList.shift();
          } else {
            coverMediaObj = parseMediaItem(DEFAULT_PLACEHOLDER);
          }
        }
      } else if (legacyMediaRaw) {
        // Retrocompatibilidad con plantillas antiguas de una sola columna multimedia
        const legacyUrls = legacyMediaRaw.split(/[,;\n]/).map(u => u.trim()).filter(Boolean);
        if (legacyUrls.length > 0) {
          coverMediaObj = parseMediaItem(legacyUrls[0]);
          galleryList = legacyUrls.slice(1).map(u => parseMediaItem(u));
        } else {
          coverMediaObj = parseMediaItem(DEFAULT_PLACEHOLDER);
        }
      } else {
        coverMediaObj = parseMediaItem(DEFAULT_PLACEHOLDER);
      }

      const mediaList = [coverMediaObj, ...galleryList];

      // Procesar especificaciones dinámicas (ej: "Marca:Sony; Color:Negro; Garantia:1 año")
      const specs = [];
      if (specsRaw) {
        try {
          if (specsRaw.startsWith('{')) {
            const parsedJson = JSON.parse(specsRaw);
            Object.entries(parsedJson).forEach(([k, v]) => specs.push({ key: k, value: String(v) }));
          } else {
            const pairs = specsRaw.split(/[;|\n]/).map(p => p.trim()).filter(Boolean);
            pairs.forEach(pair => {
              const colonIdx = pair.indexOf(':');
              if (colonIdx > 0) {
                specs.push({
                  key: pair.substring(0, colonIdx).trim(),
                  value: pair.substring(colonIdx + 1).trim()
                });
              } else if (pair) {
                specs.push({ key: 'Característica', value: pair });
              }
            });
          }
        } catch (e) {
          specs.push({ key: 'Detalle', value: specsRaw });
        }
      }

      // Procesar tags
      const tags = tagsRaw
        ? tagsRaw.split(/[,;]/).map(t => t.trim().toLowerCase()).filter(Boolean)
        : [category.toLowerCase()].filter(Boolean);

      // Asignar o resolver ID de categoría
      const categoryId = this.resolveCategoryId(category);

      const product = {
        id: 'prod_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
        sku: sku || ('SKU-' + Math.floor(1000 + Math.random() * 9000)),
        name,
        categoryId,
        basePrice,
        salePrice: salePrice && salePrice < basePrice ? salePrice : null,
        badge: badge || '',
        description: description || 'Sin descripción disponible.',
        coverImage: coverMediaObj.url,
        thumb: coverMediaObj.thumb || coverMediaObj.url,
        gallery: galleryList,
        media: mediaList,
        specs,
        tags,
        likes: 0
      };

      products.push(product);
    });

    this.parsedProducts = products;
    this.importErrors = errors;

    return {
      success: products.length > 0,
      products,
      errors
    };
  }

  /**
   * Resuelve o crea dinámicamente la categoría si no existe
   */
  resolveCategoryId(categoryName) {
    if (!categoryName) return 'cat_general';
    const cats = this.appState.data.categories;
    const norm = categoryName.trim().toLowerCase();

    const existing = cats.find(c => c.name.toLowerCase() === norm || c.id.toLowerCase() === norm);
    if (existing) return existing.id;

    // Crear categoría automáticamente si no existía
    const newId = 'cat_' + norm.replace(/[^a-z0-9]/g, '_');
    cats.push({
      id: newId,
      name: categoryName.trim(),
      icon: '📦'
    });
    return newId;
  }

  /**
   * Genera y descarga la plantilla modelo actualizada con todos los atributos del producto
   * incluyendo "URL Foto de Portada" y "URLs Fotos de Muestra" separadas.
   * Si SheetJS (XLSX) está disponible genera un archivo .xlsx nativo; de lo contrario, genera .csv.
   */
  downloadTemplate() {
    const headers = [
      "Titulo Producto",
      "SKU",
      "Categoria",
      "Precio Base",
      "Precio Oferta",
      "Badge",
      "Descripcion",
      "URL Foto de Portada",
      "URLs Fotos de Muestra",
      "Especificaciones (Clave:Valor; Clave:Valor)",
      "Tags (separados por coma)"
    ];

    const sampleRow1 = [
      "Reloj Inteligente Horizon Pro",
      "HOR-992",
      "Smartwatches & Wearables",
      "189.99",
      "149.99",
      "Oferta",
      "Smartwatch sumergible con pantalla AMOLED 1.4 pulgadas, monitor cardíaco y GPS integrado.",
      "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800",
      "https://images.unsplash.com/photo-1546868871-7041f2a55e12?w=800, https://images.unsplash.com/photo-1508685096489-7aacd43bd3b1?w=800",
      "Marca: Horizon; Bateria: 7 dias; Resistencia: 50m ATM; Color: Negro Titanio",
      "smartwatch, reloj, fitness, amoled"
    ];

    const sampleRow2 = [
      "Auriculares Studio Pro ANC",
      "AUD-501",
      "Audio & Sonido Pro",
      "249.00",
      "",
      "Nuevo",
      "Auriculares inalámbricos con cancelación activa de ruido híbrida y hasta 50 horas de autonomía.",
      "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800",
      "https://images.unsplash.com/photo-1484704849700-f032a568e944?w=800, https://images.unsplash.com/photo-1546435770-a3e426bf472b?w=800",
      "Marca: AcousticLab; Conectividad: Bluetooth 5.3; Autonomia: 50 Horas",
      "audio, auriculares, bluetooth, anc"
    ];

    if (typeof XLSX !== 'undefined') {
      try {
        const worksheetData = [headers, sampleRow1, sampleRow2];
        const ws = XLSX.utils.aoa_to_sheet(worksheetData);
        ws['!cols'] = [
          { wch: 30 }, // Titulo Producto
          { wch: 14 }, // SKU
          { wch: 24 }, // Categoria
          { wch: 14 }, // Precio Base
          { wch: 14 }, // Precio Oferta
          { wch: 16 }, // Badge
          { wch: 45 }, // Descripcion
          { wch: 50 }, // URL Foto de Portada
          { wch: 65 }, // URLs Fotos de Muestra
          { wch: 48 }, // Especificaciones
          { wch: 32 }  // Tags
        ];
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Plantilla Catalogo");
        XLSX.writeFile(wb, "plantilla_catalogo_nexoapp.xlsx");
        return;
      } catch (err) {
        console.warn("Fallback a descarga CSV:", err);
      }
    }

    const csvContent = "\uFEFF" + [
      headers.map(h => `"${h}"`).join(";"),
      sampleRow1.map(c => `"${String(c).replace(/"/g, '""')}"`).join(";"),
      sampleRow2.map(c => `"${String(c).replace(/"/g, '""')}"`).join(";")
    ].join("\r\n");

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "plantilla_catalogo_nexoapp.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}

window.CatalogImporter = CatalogImporter;
