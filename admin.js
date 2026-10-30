/**
 * admin.js - Panel de Administración B2B de NexoApp E-Commerce
 * Autenticación personalizable, CRUD de productos con carga directa de archivos locales,
 * optimización/compresión WebP automática (max 1600px, 80-85% calidad),
 * separación de portada y galería secundaria, y personalización de marca blanca.
 */

class AdminManager {
  constructor(appState) {
    this.appState = appState;
    this.isAuthenticated = sessionStorage.getItem('nexo_admin_auth') === 'true';
    this.activeTab = 'products';
    this.editingProdId = null;
    this.pendingImportProducts = [];

    // Estado de búsqueda, filtro de categoría y selección masiva en Admin
    this.selectedProductIds = new Set();
    this.adminSearchQuery = '';
    this.adminCategoryFilter = 'all';

    // Estado temporal de archivos del editor de producto
    this.editorCover = { url: '', thumb: '', type: 'image' };
    this.editorGallery = []; // [{ url, thumb, type, name }]
  }

  init() {
    this.setupEvents();
    this.setupEditorDropZones();
  }

  setupEvents() {
    // Botón de Apertura de Admin en la barra superior
    document.getElementById('btn-admin-open')?.addEventListener('click', () => this.handleOpenRequest());
    document.getElementById('btn-admin-close')?.addEventListener('click', () => this.close());
    document.getElementById('btn-admin-logout')?.addEventListener('click', () => this.logout());

    // Login Barrier
    document.getElementById('form-admin-login')?.addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleLogin();
    });
    document.getElementById('btn-close-login-modal')?.addEventListener('click', () => {
      this.appState.closeModal('modal-admin-login');
    });

    // Pestañas del Panel Admin
    document.querySelectorAll('.admin-tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const tab = e.currentTarget.getAttribute('data-tab');
        this.switchTab(tab);
      });
    });

    // CRUD: Botón Nuevo Producto
    document.getElementById('btn-admin-new-product')?.addEventListener('click', () => {
      this.openProductEditor();
    });

    // Barra de búsqueda contextual en Panel de Productos
    const adminSearchInput = document.getElementById('admin-search-input');
    const btnClearAdminSearch = document.getElementById('btn-admin-clear-search');
    adminSearchInput?.addEventListener('input', (e) => {
      this.adminSearchQuery = e.target.value.trim().toLowerCase();
      if (btnClearAdminSearch) {
        btnClearAdminSearch.classList.toggle('hidden', !this.adminSearchQuery);
      }
      this.renderProductsTable();
    });

    btnClearAdminSearch?.addEventListener('click', () => {
      if (adminSearchInput) adminSearchInput.value = '';
      this.adminSearchQuery = '';
      btnClearAdminSearch.classList.add('hidden');
      this.renderProductsTable();
    });

    // Selector de Categorías en Panel de Productos
    document.getElementById('admin-filter-category')?.addEventListener('change', (e) => {
      this.adminCategoryFilter = e.target.value || 'all';
      this.renderProductsTable();
    });

    // Checkbox Maestro "Select All"
    document.getElementById('admin-select-all-checkbox')?.addEventListener('change', (e) => {
      this.toggleSelectAllProducts(e.target.checked);
    });

    // Botón de Acción Masiva "Eliminar seleccionados"
    document.getElementById('btn-admin-bulk-delete')?.addEventListener('click', () => {
      this.bulkDeleteSelectedProducts();
    });

    // Formulario de Producto (Guardar)
    document.getElementById('form-product-editor')?.addEventListener('submit', (e) => {
      e.preventDefault();
      this.saveProduct();
    });
    document.getElementById('btn-close-product-editor')?.addEventListener('click', () => {
      this.closeProductEditor();
    });

    // Botón para agregar fila de especificación dinámica
    document.getElementById('btn-add-spec-row')?.addEventListener('click', () => {
      this.addSpecRow('', '');
    });

    // Gestor de Categorías: Formulario Nueva Categoría
    document.getElementById('form-add-category')?.addEventListener('submit', (e) => {
      e.preventDefault();
      this.addCategory();
    });

    // Marca Blanca: Guardar Branding y Estilos
    document.getElementById('form-admin-branding')?.addEventListener('submit', (e) => {
      e.preventDefault();
      this.saveBrandingAndStyles();
    });

    // Subida directa de archivos (Logo, Favicon) con compresión
    this.setupDirectFileUploads();

    // Seguridad: Cambiar Credenciales
    document.getElementById('form-admin-security')?.addEventListener('submit', (e) => {
      e.preventDefault();
      this.saveSecurityCredentials();
    });

    // Sincronización Automática GitHub & Netlify
    document.getElementById('form-admin-github')?.addEventListener('submit', (e) => {
      e.preventDefault();
      this.saveGitHubSettings();
    });

    document.getElementById('btn-github-test')?.addEventListener('click', () => {
      this.testGitHubConnection();
    });

    document.getElementById('btn-github-sync-now')?.addEventListener('click', () => {
      this.syncCatalogToGitHubNow();
    });

    document.getElementById('btn-toggle-github-token')?.addEventListener('click', () => {
      const input = document.getElementById('github-input-token');
      if (input) {
        input.type = input.type === 'password' ? 'text' : 'password';
      }
    });

    // Importador Masivo: Descargar Plantilla
    document.getElementById('btn-download-import-template')?.addEventListener('click', () => {
      this.appState.catalogImporter.downloadTemplate();
    });

    // Importador Masivo: Selector de archivo
    const fileInput = document.getElementById('input-import-spreadsheet');
    fileInput?.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      await this.handleSpreadsheetFile(file);
      e.target.value = '';
    });

    // Confirmación de Importación Masiva
    document.getElementById('btn-confirm-import')?.addEventListener('click', () => {
      this.executeImportCommit();
    });
    document.getElementById('btn-cancel-import')?.addEventListener('click', () => {
      this.appState.closeModal('modal-import-preview');
    });

    // Respaldo JSON y Reset
    document.getElementById('btn-export-full-json')?.addEventListener('click', () => {
      this.exportJsonBackup();
    });

    const importJsonInput = document.getElementById('input-import-full-json');
    importJsonInput?.addEventListener('change', (e) => {
      this.importJsonBackup(e.target.files?.[0]);
      e.target.value = '';
    });

    document.getElementById('btn-reset-sample-catalog')?.addEventListener('click', () => {
      if (confirm('¿Restablecer todo el catálogo con datos de muestra? Se sobrescribirán los productos actuales.')) {
        this.appState.resetToDefaultData();
        this.renderProductsTable();
        this.renderCategoriesList();
        this.populateBrandingForms();
        this.appState.showToast('Catálogo de muestra restaurado correctamente ✨', 'success');
      }
    });
  }

  handleOpenRequest() {
    if (!this.isAuthenticated) {
      this.appState.openModal('modal-admin-login');
      setTimeout(() => document.getElementById('admin-login-user')?.focus(), 150);
    } else {
      this.open();
    }
  }

  handleLogin() {
    const userInput = document.getElementById('admin-login-user')?.value.trim();
    const passInput = document.getElementById('admin-login-pass')?.value;
    const auth = this.appState.data.auth;

    if (userInput === auth.username && passInput === auth.passwordHash) {
      this.isAuthenticated = true;
      sessionStorage.setItem('nexo_admin_auth', 'true');
      this.appState.closeModal('modal-admin-login');
      document.getElementById('form-admin-login')?.reset();
      this.appState.showToast('Acceso concedido al Panel de Administración 🛡️', 'success');
      this.open();
    } else {
      this.appState.showToast('Credenciales incorrectas. Verifica tu usuario y contraseña.', 'warning');
    }
  }

  logout() {
    this.isAuthenticated = false;
    sessionStorage.removeItem('nexo_admin_auth');
    this.close();
    this.appState.showToast('Sesión de administración cerrada', 'info');
  }

  open() {
    const modal = document.getElementById('modal-admin');
    if (!modal) return;
    this.populateAdminCategoryFilter();
    this.renderProductsTable();
    this.renderCategoriesList();
    this.populateBrandingForms();
    this.populateSecurityForm();
    this.populateGitHubForm();
    this.updateGitHubStatusBanner();
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }

  close() {
    const modal = document.getElementById('modal-admin');
    if (!modal) return;
    modal.classList.add('hidden');
    document.body.style.overflow = '';
  }

  switchTab(tabId) {
    this.activeTab = tabId;
    document.querySelectorAll('.admin-tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-tab') === tabId);
    });
    document.querySelectorAll('.admin-tab-panel').forEach(panel => {
      panel.classList.toggle('active', panel.id === `admin-panel-${tabId}`);
    });
    if (tabId === 'products') {
      this.populateAdminCategoryFilter();
      this.renderProductsTable();
    } else if (tabId === 'github') {
      this.populateGitHubForm();
      this.updateGitHubStatusBanner();
    }
  }

  /**
   * ==========================================
   * 1. CRUD DE PRODUCTOS, FILTROS & EDICIÓN MASIVA
   * ==========================================
   */
  populateAdminCategoryFilter() {
    const select = document.getElementById('admin-filter-category');
    if (!select) return;

    const currentVal = this.adminCategoryFilter || 'all';
    const categories = this.appState.data.categories || [];

    select.innerHTML = `<option value="all">🏷️ Todas las categorías (${(this.appState.data.products || []).length})</option>` +
      categories.map(cat => {
        const count = (this.appState.data.products || []).filter(p => p.categoryId === cat.id).length;
        return `<option value="${cat.id}">${cat.icon || '📦'} ${cat.name} (${count})</option>`;
      }).join('');

    if (categories.some(c => c.id === currentVal) || currentVal === 'all') {
      select.value = currentVal;
    } else {
      this.adminCategoryFilter = 'all';
      select.value = 'all';
    }
  }

  getFilteredAdminProducts() {
    let list = [...(this.appState.data.products || [])];

    // 1. Filtrar por categoría seleccionada en el dropdown
    if (this.adminCategoryFilter && this.adminCategoryFilter !== 'all') {
      list = list.filter(p => p.categoryId === this.adminCategoryFilter);
    }

    // 2. Filtrar por barra de búsqueda contextual
    if (this.adminSearchQuery) {
      const q = this.adminSearchQuery;
      list = list.filter(p => {
        const nameMatch = (p.name || '').toLowerCase().includes(q);
        const skuMatch = (p.sku || '').toLowerCase().includes(q);
        const badgeMatch = (p.badge || '').toLowerCase().includes(q);
        const catName = this.appState.catalogManager.getCategoryName(p.categoryId).toLowerCase();
        const catMatch = catName.includes(q);
        const tagMatch = (p.tags || []).some(t => t.toLowerCase().includes(q));
        return nameMatch || skuMatch || badgeMatch || catMatch || tagMatch;
      });
    }

    return list;
  }

  renderProductsTable() {
    const tbody = document.getElementById('admin-products-tbody');
    if (!tbody) return;

    this.populateAdminCategoryFilter();

    // Limpiar IDs seleccionados que ya no existan en el catálogo general
    const existingIds = new Set((this.appState.data.products || []).map(p => p.id));
    for (const id of this.selectedProductIds) {
      if (!existingIds.has(id)) {
        this.selectedProductIds.delete(id);
      }
    }

    const filteredProducts = this.getFilteredAdminProducts();

    if (filteredProducts.length === 0) {
      const isFiltering = this.adminSearchQuery || (this.adminCategoryFilter && this.adminCategoryFilter !== 'all');
      tbody.innerHTML = `
        <tr>
          <td colspan="8" style="text-align:center; padding:36px 20px; color:var(--text-muted);">
            ${isFiltering
              ? '🔍 No se encontraron productos que coincidan con tu búsqueda o categoría seleccionada.'
              : 'No hay productos en el catálogo. Haz clic en "+ Añadir Nuevo Producto" o importa una hoja Excel.'}
          </td>
        </tr>
      `;
      this.updateBulkSelectionUI(filteredProducts);
      return;
    }

    tbody.innerHTML = filteredProducts.map(prod => {
      const cover = this.appState.catalogManager.getCoverMedia(prod);
      const catName = this.appState.catalogManager.getCategoryName(prod.categoryId);
      const hasDiscount = prod.salePrice && prod.salePrice < prod.basePrice;
      const galleryCount = this.appState.catalogManager.getSecondaryGallery(prod).length;
      const likes = prod.likes || 0;
      const isSelected = this.selectedProductIds.has(prod.id);

      return `
        <tr class="${isSelected ? 'row-selected' : ''}" data-row-id="${prod.id}">
          <td class="col-checkbox">
            <label class="admin-checkbox-label">
              <input type="checkbox" class="admin-checkbox-input row-product-checkbox" data-prod-id="${prod.id}" ${isSelected ? 'checked' : ''} onchange="window.app.adminManager.toggleProductSelection('${prod.id}', this.checked)">
              <span class="admin-checkbox-custom"></span>
            </label>
          </td>
          <td class="col-thumb">
            <img src="${cover.thumb || cover.url}" alt="${prod.name}" class="admin-table-thumb" />
          </td>
          <td class="col-main">
            <strong class="prod-row-name">${prod.name}</strong>
            <div class="prod-row-sub">
              <span class="prod-row-cat">${catName}</span>
              ${prod.sku ? `<span class="prod-row-sku">SKU: ${prod.sku}</span>` : ''}
            </div>
          </td>
          <td class="col-price">
            ${hasDiscount
              ? `<span class="price-strikethrough">$${prod.basePrice.toFixed(2)}</span>
                 <strong class="price-sale-tag">$${prod.salePrice.toFixed(2)}</strong>`
              : `<strong>$${prod.basePrice.toFixed(2)}</strong>`
            }
          </td>
          <td class="col-badge">
            ${prod.badge ? `<span class="badge-custom-pill">${prod.badge}</span>` : '—'}
          </td>
          <td class="col-popularity">
            <span class="popularity-badge" title="${likes} «Me gusta» acumulados">
              ❤️ <strong>${likes}</strong>
            </span>
          </td>
          <td class="col-specs-count">
            <span class="specs-counter-tag">${(prod.specs || []).length} specs</span>
            ${galleryCount > 0 ? `<span class="gallery-counter-tag">+${galleryCount} media</span>` : ''}
          </td>
          <td class="col-actions">
            <button class="btn-action-icon" onclick="window.app.adminManager.openProductEditor('${prod.id}')" title="Editar">✏️</button>
            <button class="btn-action-icon" onclick="window.app.adminManager.duplicateProduct('${prod.id}')" title="Duplicar">📋</button>
            <button class="btn-action-icon btn-del" onclick="window.app.adminManager.deleteProduct('${prod.id}')" title="Eliminar">🗑️</button>
          </td>
        </tr>
      `;
    }).join('');

    this.updateBulkSelectionUI(filteredProducts);
  }

  toggleProductSelection(prodId, isChecked) {
    if (isChecked) {
      this.selectedProductIds.add(prodId);
    } else {
      this.selectedProductIds.delete(prodId);
    }

    const row = document.querySelector(`tr[data-row-id="${prodId}"]`);
    if (row) {
      row.classList.toggle('row-selected', isChecked);
    }

    this.updateBulkSelectionUI(this.getFilteredAdminProducts());
  }

  toggleSelectAllProducts(isChecked) {
    const filteredProducts = this.getFilteredAdminProducts();
    filteredProducts.forEach(p => {
      if (isChecked) {
        this.selectedProductIds.add(p.id);
      } else {
        this.selectedProductIds.delete(p.id);
      }
    });

    this.renderProductsTable();
  }

  updateBulkSelectionUI(filteredProducts = null) {
    const currentList = filteredProducts || this.getFilteredAdminProducts();
    const selectAllCheckbox = document.getElementById('admin-select-all-checkbox');
    const bulkDeleteBtn = document.getElementById('btn-admin-bulk-delete');
    const selectedCountEl = document.getElementById('bulk-selected-count');

    const totalSelected = this.selectedProductIds.size;

    if (selectedCountEl) {
      selectedCountEl.textContent = totalSelected;
    }

    if (bulkDeleteBtn) {
      bulkDeleteBtn.classList.toggle('hidden', totalSelected === 0);
    }

    if (selectAllCheckbox) {
      if (currentList.length === 0) {
        selectAllCheckbox.checked = false;
        selectAllCheckbox.indeterminate = false;
      } else {
        const selectedInView = currentList.filter(p => this.selectedProductIds.has(p.id)).length;
        selectAllCheckbox.checked = selectedInView === currentList.length && currentList.length > 0;
        selectAllCheckbox.indeterminate = selectedInView > 0 && selectedInView < currentList.length;
      }
    }
  }

  bulkDeleteSelectedProducts() {
    const count = this.selectedProductIds.size;
    if (count === 0) return;

    const confirmMsg = count === 1
      ? '¿Estás seguro de que deseas eliminar el producto seleccionado?'
      : `¿Estás seguro de que deseas eliminar los ${count} productos seleccionados de forma permanente?`;

    if (!confirm(confirmMsg)) return;

    this.appState.data.products = (this.appState.data.products || []).filter(
      p => !this.selectedProductIds.has(p.id)
    );

    this.selectedProductIds.clear();
    this.appState.saveData();
    this.populateAdminCategoryFilter();
    this.renderProductsTable();
    this.appState.catalogManager.renderContent();

    this.appState.showToast(`🗑️ ${count} ${count === 1 ? 'producto eliminado' : 'productos eliminados'} correctamente`, 'info');
    this.triggerGitHubAutoSync(`Eliminación masiva de ${count} producto(s)`);
  }

  /**
   * ==========================================
   * 2. CARGA DE ARCHIVOS LOCALES Y COMPRESIÓN
   * ==========================================
   */
  setupEditorDropZones() {
    // 1. Dropzone de Imagen de Portada Principal
    const coverDropZone = document.getElementById('cover-drop-zone');
    const coverFileInput = document.getElementById('input-cover-file');
    
    if (coverDropZone && coverFileInput) {
      window.ImageOptimizer?.setupDropZone(coverDropZone, coverFileInput, async (files) => {
        if (!files || files.length === 0) return;
        await this.handleCoverFileUpload(files[0]);
      });
    }

    // 2. Dropzone de Galería Secundaria Multimedia (Múltiples fotos y videos)
    const galleryDropZone = document.getElementById('gallery-drop-zone');
    const galleryFileInput = document.getElementById('input-gallery-files');

    if (galleryDropZone && galleryFileInput) {
      window.ImageOptimizer?.setupDropZone(galleryDropZone, galleryFileInput, async (files) => {
        if (!files || files.length === 0) return;
        await this.handleGalleryFilesUpload(files);
      });
    }

    // Toggle de URL manual si el admin prefiere ingresar enlaces
    document.getElementById('btn-toggle-manual-url')?.addEventListener('click', () => {
      const box = document.getElementById('manual-url-input-box');
      if (box) box.classList.toggle('hidden');
    });

    document.getElementById('btn-apply-manual-urls')?.addEventListener('click', () => {
      this.applyManualUrls();
    });
  }

  async handleCoverFileUpload(file) {
    this.appState.showToast('Optimizando imagen de portada...', 'info');
    try {
      if (file.type.startsWith('image/')) {
        const compressed = await window.ImageOptimizer.compressImage(file);
        this.editorCover = {
          url: compressed.full,
          thumb: compressed.thumb,
          type: 'image',
          name: file.name
        };
        const savedKb = Math.round((compressed.originalSize - compressed.compressedSize) / 1024);
        this.appState.showToast(`Portada optimizada a WebP 1600px (Ahorro: ~${savedKb > 0 ? savedKb : 0} KB) ✅`, 'success');
      } else if (file.type.startsWith('video/')) {
        const video = await window.ImageOptimizer.processVideo(file);
        this.editorCover = {
          url: video.url,
          thumb: '',
          type: 'video',
          name: file.name
        };
        this.appState.showToast('Video de portada cargado correctamente 🎥', 'success');
      }
      this.renderCoverPreview();
    } catch (err) {
      alert('Error al procesar el archivo de portada: ' + err.message);
    }
  }

  async handleGalleryFilesUpload(files) {
    this.appState.showToast(`Procesando y comprimiendo ${files.length} archivo(s)...`, 'info');
    let addedCount = 0;

    for (const file of files) {
      try {
        if (file.type.startsWith('image/')) {
          const compressed = await window.ImageOptimizer.compressImage(file);
          this.editorGallery.push({
            url: compressed.full,
            thumb: compressed.thumb,
            type: 'image',
            name: file.name
          });
          addedCount++;
        } else if (file.type.startsWith('video/')) {
          const video = await window.ImageOptimizer.processVideo(file);
          this.editorGallery.push({
            url: video.url,
            thumb: '',
            type: 'video',
            name: file.name
          });
          addedCount++;
        }
      } catch (err) {
        console.error('Error al optimizar archivo de galería:', err);
      }
    }

    this.renderGalleryPreview();
    this.appState.showToast(`${addedCount} archivo(s) optimizados y añadidos a la galería secundaria 🚀`, 'success');
  }

  renderCoverPreview() {
    const previewContainer = document.getElementById('cover-preview-card');
    const dropPrompt = document.getElementById('cover-drop-prompt');
    if (!previewContainer || !dropPrompt) return;

    if (this.editorCover && this.editorCover.url) {
      dropPrompt.style.display = 'none';
      previewContainer.style.display = 'flex';
      
      const mediaEl = previewContainer.querySelector('.cover-preview-media');
      if (mediaEl) {
        if (this.editorCover.type === 'video') {
          mediaEl.innerHTML = `<video src="${this.editorCover.url}" controls muted style="max-height:140px; border-radius:8px;"></video>`;
        } else {
          mediaEl.innerHTML = `<img src="${this.editorCover.thumb || this.editorCover.url}" alt="Portada" style="max-height:140px; border-radius:8px; object-fit:cover;" />`;
        }
      }

      const infoEl = previewContainer.querySelector('.cover-preview-info');
      if (infoEl) {
        infoEl.innerHTML = `
          <strong>${this.editorCover.name || 'Portada del Producto'}</strong>
          <span class="cover-type-tag">${this.editorCover.type === 'video' ? '🎥 Video' : '📷 WebP 1600px'}</span>
        `;
      }
    } else {
      dropPrompt.style.display = 'flex';
      previewContainer.style.display = 'none';
    }
  }

  removeCoverFile() {
    this.editorCover = { url: '', thumb: '', type: 'image' };
    this.renderCoverPreview();
    this.appState.showToast('Imagen de portada eliminada', 'info');
  }

  renderGalleryPreview() {
    const listContainer = document.getElementById('gallery-items-grid');
    const countBadge = document.getElementById('gallery-count-badge');
    if (!listContainer) return;

    if (countBadge) {
      countBadge.textContent = `${this.editorGallery.length} archivo${this.editorGallery.length === 1 ? '' : 's'}`;
    }

    if (this.editorGallery.length === 0) {
      listContainer.innerHTML = `<div class="empty-gallery-hint">No hay fotos o videos adicionales en la galería secundaria. Arrastra archivos arriba para añadirlos.</div>`;
      return;
    }

    listContainer.innerHTML = this.editorGallery.map((item, idx) => {
      const isVideo = item.type === 'video';
      return `
        <div class="gallery-item-admin-card" data-idx="${idx}">
          <div class="gallery-item-thumb-box">
            ${isVideo
              ? `<video src="${item.url}" muted></video><div class="thumb-vid-badge">🎥</div>`
              : `<img src="${item.thumb || item.url}" alt="Foto ${idx + 1}" />`
            }
          </div>
          <div class="gallery-item-meta">
            <span class="gallery-item-type">${isVideo ? 'Video' : 'Foto WebP'}</span>
            <button type="button" class="btn-remove-gallery-item" onclick="window.app.adminManager.removeGalleryItem(${idx})" title="Eliminar archivo">🗑️</button>
          </div>
        </div>
      `;
    }).join('');
  }

  removeGalleryItem(index) {
    if (index >= 0 && index < this.editorGallery.length) {
      this.editorGallery.splice(index, 1);
      this.renderGalleryPreview();
    }
  }

  applyManualUrls(silent = false) {
    const manualCoverInput = document.getElementById('manual-cover-url');
    const manualGalleryInput = document.getElementById('manual-gallery-urls');
    const coverUrl = manualCoverInput?.value.trim();
    const galleryUrlsRaw = manualGalleryInput?.value.trim();

    if (coverUrl) {
      const isVideo = coverUrl.match(/\.(mp4|webm|ogg|mov)($|\?)/i);
      this.editorCover = {
        url: coverUrl,
        thumb: coverUrl,
        type: isVideo ? 'video' : 'image',
        name: 'URL Externa'
      };
      if (manualCoverInput) manualCoverInput.value = '';
      this.renderCoverPreview();
    }

    if (galleryUrlsRaw) {
      const urls = galleryUrlsRaw.split(/[\n,;]/).map(u => u.trim()).filter(Boolean);
      urls.forEach(u => {
        const isVideo = u.match(/\.(mp4|webm|ogg|mov)($|\?)/i);
        this.editorGallery.push({
          url: u,
          thumb: u,
          type: isVideo ? 'video' : 'image',
          name: 'URL Externa'
        });
      });
      if (manualGalleryInput) manualGalleryInput.value = '';
      this.renderGalleryPreview();
    }

    if (!silent && (coverUrl || galleryUrlsRaw)) {
      this.appState.showToast('URLs externas aplicadas al producto', 'success');
    }
  }

  /**
   * Limpia por completo el estado del formulario de edición de producto
   * para evitar que datos o archivos de un producto anterior persistan al seleccionar otro.
   */
  resetProductEditorState() {
    const form = document.getElementById('form-product-editor');
    if (form) form.reset();

    const fieldIds = [
      'prod-field-name',
      'prod-field-sku',
      'prod-field-baseprice',
      'prod-field-saleprice',
      'prod-field-badge',
      'prod-field-desc',
      'prod-field-tags',
      'manual-cover-url',
      'manual-gallery-urls',
      'input-cover-file',
      'input-gallery-files'
    ];
    fieldIds.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });

    const manualBox = document.getElementById('manual-url-input-box');
    if (manualBox) manualBox.classList.add('hidden');

    const specsContainer = document.getElementById('specs-builder-rows');
    if (specsContainer) specsContainer.innerHTML = '';

    this.editorCover = { url: '', thumb: '', type: 'image', name: '' };
    this.editorGallery = [];
  }

  openProductEditor(prodId = null) {
    const modal = document.getElementById('modal-product-editor');
    const titleEl = document.getElementById('product-editor-title');
    const catSelect = document.getElementById('prod-field-cat');
    const formScroll = document.querySelector('#modal-product-editor .editor-form-scroll');

    if (!modal) return;

    // 1. Limpiar absolutamente todo el estado del producto anterior antes de cargar el nuevo
    this.resetProductEditorState();
    this.editingProdId = prodId;

    // 2. Poblar selector de categorías actualizado
    const categories = this.appState.data.categories || [];
    if (catSelect) {
      catSelect.innerHTML = categories.map(c => `
        <option value="${c.id}">${c.name}</option>
      `).join('');
    }

    if (prodId) {
      // Buscar siempre la versión fresca del producto seleccionado por ID
      const prod = (this.appState.data.products || []).find(p => String(p.id) === String(prodId));
      if (!prod) {
        this.appState.showToast('No se encontró el producto solicitado', 'warning');
        return;
      }

      if (titleEl) titleEl.textContent = `Editar Producto: ${prod.name}`;

      document.getElementById('prod-field-name').value = prod.name || '';
      document.getElementById('prod-field-sku').value = prod.sku || '';
      if (catSelect) {
        catSelect.value = categories.some(c => c.id === prod.categoryId)
          ? prod.categoryId
          : (categories[0]?.id || '');
      }
      document.getElementById('prod-field-baseprice').value = prod.basePrice !== undefined && prod.basePrice !== null ? prod.basePrice : '';
      document.getElementById('prod-field-saleprice').value = prod.salePrice !== undefined && prod.salePrice !== null ? prod.salePrice : '';
      document.getElementById('prod-field-badge').value = prod.badge || '';
      document.getElementById('prod-field-desc').value = prod.description || '';
      document.getElementById('prod-field-tags').value = Array.isArray(prod.tags) ? prod.tags.join(', ') : '';

      // Cargar copia independiente de portada y galería del producto seleccionado
      const cover = this.appState.catalogManager.getCoverMedia(prod);
      this.editorCover = {
        url: cover.url || '',
        thumb: cover.thumb || cover.url || '',
        type: cover.type || 'image',
        name: cover.name || 'Portada Actual'
      };

      const secondary = this.appState.catalogManager.getSecondaryGallery(prod);
      this.editorGallery = JSON.parse(JSON.stringify(secondary || []));

      // Reconstruir filas de especificaciones dinámicas del producto seleccionado
      if (Array.isArray(prod.specs) && prod.specs.length > 0) {
        prod.specs.forEach(s => this.addSpecRow(s.key || '', s.value || ''));
      }
    } else {
      if (titleEl) titleEl.textContent = 'Nuevo Producto';
      if (catSelect && categories.length > 0) {
        catSelect.value = categories[0].id;
      }

      this.editorCover = {
        url: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800',
        thumb: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400',
        type: 'image',
        name: 'Imagen Predeterminada'
      };
      this.editorGallery = [];

      this.addSpecRow('Marca', '');
      this.addSpecRow('Color', '');
      this.addSpecRow('Garantía', '1 Año Oficial');
    }

    this.renderCoverPreview();
    this.renderGalleryPreview();

    modal.classList.remove('hidden');
    if (formScroll) formScroll.scrollTop = 0;
  }

  closeProductEditor() {
    document.getElementById('modal-product-editor')?.classList.add('hidden');
    this.editingProdId = null;
    this.resetProductEditorState();
  }

  addSpecRow(key = '', value = '') {
    const container = document.getElementById('specs-builder-rows');
    if (!container) return;

    const row = document.createElement('div');
    row.className = 'spec-builder-row';
    row.innerHTML = `
      <input type="text" class="form-input spec-key-input" placeholder="Atributo (ej: Marca, Color)" value="${key.replace(/"/g, '&quot;')}" required />
      <input type="text" class="form-input spec-val-input" placeholder="Valor (ej: Titanio, 64GB)" value="${value.replace(/"/g, '&quot;')}" required />
      <button type="button" class="btn-remove-spec-row" title="Eliminar fila">✕</button>
    `;

    row.querySelector('.btn-remove-spec-row').addEventListener('click', () => row.remove());
    container.appendChild(row);
  }

  saveProduct() {
    // Si el usuario escribió URLs manuales y pulsó directamente "Guardar Producto", aplicarlas antes de guardar
    this.applyManualUrls(true);

    const name = document.getElementById('prod-field-name').value.trim();
    const sku = document.getElementById('prod-field-sku').value.trim();
    const categoryId = document.getElementById('prod-field-cat').value;
    const basePrice = parseFloat(document.getElementById('prod-field-baseprice').value) || 0;
    const salePriceRaw = document.getElementById('prod-field-saleprice').value.trim();
    const salePrice = salePriceRaw ? parseFloat(salePriceRaw) : null;
    const badge = document.getElementById('prod-field-badge').value.trim();
    const description = document.getElementById('prod-field-desc').value.trim();
    const tagsRaw = document.getElementById('prod-field-tags').value.trim();

    if (!name || basePrice <= 0) {
      alert('Por favor ingresa un nombre y un precio base válido mayor a 0.');
      return;
    }

    // Asegurar que exista al menos una portada
    const coverImage = (this.editorCover && this.editorCover.url) 
      ? this.editorCover.url 
      : 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800';
    
    const thumb = (this.editorCover && this.editorCover.thumb) || coverImage;
    const gallery = JSON.parse(JSON.stringify(this.editorGallery || []));

    // Array unificado retrocompatible
    const media = [
      { type: this.editorCover.type || 'image', url: coverImage, thumb },
      ...gallery
    ];

    // Extraer especificaciones dinámicas
    const specs = [];
    document.querySelectorAll('.spec-builder-row').forEach(row => {
      const k = row.querySelector('.spec-key-input')?.value.trim();
      const v = row.querySelector('.spec-val-input')?.value.trim();
      if (k && v) {
        specs.push({ key: k, value: v });
      }
    });

    const tags = tagsRaw ? tagsRaw.split(',').map(t => t.trim().toLowerCase()).filter(Boolean) : [];

    if (this.editingProdId) {
      const idx = this.appState.data.products.findIndex(p => String(p.id) === String(this.editingProdId));
      if (idx !== -1) {
        const existing = this.appState.data.products[idx];
        this.appState.data.products[idx] = {
          ...existing,
          name, sku, categoryId, basePrice, salePrice, badge, description,
          coverImage, thumb, gallery, media, specs, tags,
          likes: existing.likes || 0
        };
      }
    } else {
      const newProd = {
        id: 'prod_' + Date.now(),
        sku: sku || ('SKU-' + Math.floor(1000 + Math.random() * 9000)),
        name,
        categoryId,
        basePrice,
        salePrice,
        badge,
        description,
        coverImage,
        thumb,
        gallery,
        media,
        specs,
        tags,
        likes: 0
      };
      this.appState.data.products.unshift(newProd);
    }

    this.appState.saveData();
    this.renderProductsTable();
    this.closeProductEditor();
    this.appState.catalogManager.renderContent();
    this.appState.showToast('Producto guardado exitosamente ✅', 'success');
    this.triggerGitHubAutoSync(`Guardar producto "${name}"`);
  }

  duplicateProduct(prodId) {
    const prod = this.appState.data.products.find(p => p.id === prodId);
    if (!prod) return;

    const duplicated = JSON.parse(JSON.stringify(prod));
    duplicated.id = 'prod_' + Date.now();
    duplicated.sku = (prod.sku ? prod.sku + '-COPIA' : 'SKU-' + Math.floor(1000 + Math.random() * 9000));
    duplicated.name = prod.name + ' (Copia)';
    duplicated.likes = 0; // Inicia con 0 votos

    this.appState.data.products.unshift(duplicated);
    this.appState.saveData();
    this.renderProductsTable();
    this.appState.catalogManager.renderContent();
    this.appState.showToast(`Producto duplicado: "${duplicated.name}"`, 'info');
    this.triggerGitHubAutoSync(`Duplicar producto "${duplicated.name}"`);
  }

  deleteProduct(prodId) {
    if (!confirm('¿Estás seguro de que deseas eliminar este producto del catálogo?')) return;
    this.appState.data.products = this.appState.data.products.filter(p => p.id !== prodId);
    this.appState.saveData();
    this.renderProductsTable();
    this.appState.catalogManager.renderContent();
    this.appState.showToast('Producto eliminado del catálogo', 'info');
    this.triggerGitHubAutoSync('Eliminar producto');
  }

  /**
   * ==========================================
   * 3. GESTOR DINÁMICO DE CATEGORÍAS
   * ==========================================
   */
  renderCategoriesList() {
    const listContainer = document.getElementById('admin-categories-list');
    if (!listContainer) return;

    const categories = this.appState.data.categories || [];

    listContainer.innerHTML = categories.map((cat, idx) => {
      const count = (this.appState.data.products || []).filter(p => p.categoryId === cat.id).length;

      return `
        <div class="category-item-row" data-cat-id="${cat.id}">
          <div class="cat-reorder-btns">
            ${idx > 0 ? `<button class="btn-cat-move" onclick="window.app.adminManager.moveCategory(${idx}, -1)" title="Subir">▲</button>` : ''}
            ${idx < categories.length - 1 ? `<button class="btn-cat-move" onclick="window.app.adminManager.moveCategory(${idx}, 1)" title="Bajar">▼</button>` : ''}
          </div>
          <div class="cat-display-icon">${cat.icon || '📦'}</div>
          <div class="cat-info-block">
            <strong>${cat.name}</strong>
            <small class="cat-count-sub">${count} producto${count === 1 ? '' : 's'}</small>
          </div>
          <div class="cat-actions-block">
            <button class="btn-action-icon" onclick="window.app.adminManager.renameCategory('${cat.id}')" title="Renombrar">✏️</button>
            <button class="btn-action-icon btn-del" onclick="window.app.adminManager.deleteCategory('${cat.id}')" title="Eliminar">🗑️</button>
          </div>
        </div>
      `;
    }).join('');
  }

  addCategory() {
    const nameInput = document.getElementById('new-cat-name');
    const iconInput = document.getElementById('new-cat-icon');

    const name = nameInput?.value.trim();
    const icon = iconInput?.value.trim() || '📦';

    if (!name) return;

    const newId = 'cat_' + name.toLowerCase().replace(/[^a-z0-9]/g, '_') + '_' + Date.now().toString(36);
    this.appState.data.categories.push({ id: newId, name, icon });
    this.appState.saveData();

    nameInput.value = '';
    iconInput.value = '';

    this.renderCategoriesList();
    this.appState.catalogManager.renderCategoryNav();
    this.appState.showToast(`Categoría "${name}" creada exitosamente`, 'success');
    this.triggerGitHubAutoSync(`Crear categoría "${name}"`);
  }

  renameCategory(catId) {
    const cat = this.appState.data.categories.find(c => c.id === catId);
    if (!cat) return;

    const newName = prompt('Nuevo nombre de categoría:', cat.name);
    if (!newName || newName.trim() === '') return;

    const newIcon = prompt('Icono o emoji para la categoría:', cat.icon || '📦');

    cat.name = newName.trim();
    if (newIcon) cat.icon = newIcon.trim();

    this.appState.saveData();
    this.renderCategoriesList();
    this.appState.catalogManager.renderCategoryNav();
    this.appState.catalogManager.renderContent();
    this.appState.showToast('Categoría actualizada', 'success');
    this.triggerGitHubAutoSync(`Renombrar categoría a "${cat.name}"`);
  }

  deleteCategory(catId) {
    const cat = this.appState.data.categories.find(c => c.id === catId);
    if (!cat) return;

    if (this.appState.data.categories.length <= 1) {
      alert('Debe existir al menos una categoría en el catálogo.');
      return;
    }

    const assignedCount = (this.appState.data.products || []).filter(p => p.categoryId === catId).length;
    if (assignedCount > 0) {
      if (!confirm(`La categoría "${cat.name}" tiene ${assignedCount} productos asociados. Se reasignarán a la primera categoría disponible. ¿Continuar?`)) {
        return;
      }
    }

    this.appState.data.categories = this.appState.data.categories.filter(c => c.id !== catId);
    const fallbackCatId = this.appState.data.categories[0].id;

    this.appState.data.products.forEach(p => {
      if (p.categoryId === catId) p.categoryId = fallbackCatId;
    });

    this.appState.saveData();
    this.renderCategoriesList();
    this.appState.catalogManager.renderCategoryNav();
    this.appState.catalogManager.renderContent();
    this.appState.showToast('Categoría eliminada y productos reasignados', 'info');
    this.triggerGitHubAutoSync('Eliminar categoría');
  }

  moveCategory(index, direction) {
    const targetIdx = index + direction;
    const cats = this.appState.data.categories;
    if (targetIdx < 0 || targetIdx >= cats.length) return;

    const temp = cats[index];
    cats[index] = cats[targetIdx];
    cats[targetIdx] = temp;

    this.appState.saveData();
    this.renderCategoriesList();
    this.appState.catalogManager.renderCategoryNav();
    this.triggerGitHubAutoSync('Reordenar categorías');
  }

  /**
   * ==========================================
   * 4. IMPORTACIÓN MASIVA EXCEL / CSV
   * ==========================================
   */
  async handleSpreadsheetFile(file) {
    this.appState.showToast('Procesando archivo de catálogo...', 'info');
    const result = await this.appState.catalogImporter.processFile(file);

    if (!result.success && result.products.length === 0) {
      alert('Error en el archivo:\n' + result.errors.join('\n'));
      return;
    }

    this.pendingImportProducts = result.products;
    this.showImportPreview(result);
  }

  showImportPreview(result) {
    const modal = document.getElementById('modal-import-preview');
    const summaryEl = document.getElementById('import-preview-summary');
    const tableBody = document.getElementById('import-preview-tbody');
    const errorsBox = document.getElementById('import-errors-box');

    if (!modal || !summaryEl || !tableBody) return;

    summaryEl.textContent = `Se detectaron ${result.products.length} productos nuevos listos para agregar al catálogo (protegiendo el catálogo existente).`;

    if (result.errors && result.errors.length > 0) {
      errorsBox.style.display = 'block';
      errorsBox.innerHTML = `<strong>Advertencias (${result.errors.length}):</strong><br>` + result.errors.slice(0, 5).join('<br>') + (result.errors.length > 5 ? '<br>...' : '');
    } else {
      errorsBox.style.display = 'none';
    }

    tableBody.innerHTML = result.products.slice(0, 10).map((p, i) => {
      const sampleCount = Array.isArray(p.gallery) ? p.gallery.length : 0;
      return `
        <tr>
          <td>${i + 1}</td>
          <td>
            <div style="display:flex; align-items:center; gap:8px;">
              <img src="${p.thumb || p.coverImage}" alt="${p.name}" style="width:34px; height:34px; border-radius:6px; object-fit:cover; flex-shrink:0;" />
              <strong>${p.name}</strong>
            </div>
          </td>
          <td>${p.sku}</td>
          <td>${this.appState.catalogManager.getCategoryName(p.categoryId)}</td>
          <td>$${p.basePrice.toFixed(2)} ${p.salePrice ? `<span class="price-sale-tag">($${p.salePrice.toFixed(2)})</span>` : ''}</td>
          <td>${p.badge || '—'}</td>
          <td>1 portada + ${sampleCount} muestra${sampleCount === 1 ? '' : 's'} / ${(p.specs || []).length} specs</td>
        </tr>
      `;
    }).join('') + (result.products.length > 10 ? `<tr><td colspan="7" style="text-align:center; font-style:italic;">... y ${result.products.length - 10} productos más.</td></tr>` : '');

    modal.classList.remove('hidden');
  }

  /**
   * Ejecuta la importación masiva protegiendo estrictamente el catálogo heredado.
   * REGLA DE PROTECCIÓN DE DATOS (Data Integrity):
   * - Está estrictamente prohibido alterar, sobrescribir, corromper o eliminar los productos existentes.
   * - Los nuevos productos importados se agregan al catálogo preservando intactos todos los productos previos.
   */
  executeImportCommit() {
    if (!this.pendingImportProducts || this.pendingImportProducts.length === 0) return;

    const existingProducts = Array.isArray(this.appState.data.products)
      ? [...this.appState.data.products]
      : [];

    const existingIds = new Set(existingProducts.map(p => String(p.id)));
    const existingSkus = new Set(existingProducts.map(p => String(p.sku || '').trim().toLowerCase()).filter(Boolean));

    const newProductsToInsert = [];

    this.pendingImportProducts.forEach((importedProd, idx) => {
      const safeProd = JSON.parse(JSON.stringify(importedProd));

      // Garantizar ID único para no colisionar jamás con un producto existente
      if (!safeProd.id || existingIds.has(String(safeProd.id))) {
        safeProd.id = `prod_${Date.now()}_${idx}_${Math.random().toString(36).substr(2, 5)}`;
      }
      existingIds.add(String(safeProd.id));

      // Si el SKU ya existe en el catálogo heredado, NO sobrescribir el producto existente:
      // asignar un sufijo único al nuevo producto importado o conservar ambos intactos
      const normSku = String(safeProd.sku || '').trim().toLowerCase();
      if (normSku && existingSkus.has(normSku)) {
        safeProd.sku = `${safeProd.sku}-${Math.floor(100 + Math.random() * 900)}`;
      }
      if (safeProd.sku) {
        existingSkus.add(String(safeProd.sku).trim().toLowerCase());
      }

      newProductsToInsert.push(safeProd);
    });

    // Conservar intactos todos los productos existentes y añadir los nuevos productos importados
    this.appState.data.products = [...existingProducts, ...newProductsToInsert];

    this.appState.saveData();
    this.appState.closeModal('modal-import-preview');
    this.populateAdminCategoryFilter();
    this.renderProductsTable();
    this.renderCategoriesList();
    this.appState.catalogManager.renderCategoryNav();
    this.appState.catalogManager.renderContent();

    this.appState.showToast(`¡Importación exitosa! Se añadieron ${newProductsToInsert.length} nuevos productos protegiendo el catálogo existente 🚀`, 'success');
    this.triggerGitHubAutoSync(`Importación masiva de ${newProductsToInsert.length} nuevos productos`);
    this.pendingImportProducts = [];
  }

  /**
   * ==========================================
   * 5. PERSONALIZACIÓN DE MARCA BLANCA & THEME
   * ==========================================
   */
  setupDirectFileUploads() {
    // 1. Subida directa de Logo con optimización (preservando transparencia PNG/SVG/WebP) y persistencia inmediata
    const logoInput = document.getElementById('upload-brand-logo');
    logoInput?.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const compressed = await window.ImageOptimizer.compressImage(file, {
          maxDim: 800,
          thumbDim: 400,
          preserveAlpha: true
        });
        const finalLogoData = compressed.full || compressed.thumb;
        this.appState.data.branding.logo = finalLogoData;

        const preview = document.getElementById('preview-brand-logo');
        if (preview) {
          preview.src = finalLogoData;
          preview.style.display = 'block';
        }
        const removeBtn = document.getElementById('btn-remove-brand-logo');
        if (removeBtn) removeBtn.style.display = 'inline-flex';

        const logoUrlInput = document.getElementById('brand-input-logo-url');
        if (logoUrlInput) logoUrlInput.value = '';

        // Persistir y aplicar en vivo inmediatamente en la cabecera de la tienda
        this.appState.saveData();
        this.appState.applyBrandingAndTheme();
        this.appState.showToast('Logo actualizado y aplicado en la tienda ✅', 'success');
        this.triggerGitHubAutoSync('Actualizar logo de la marca');
      } catch (err) {
        alert('Error al procesar logo: ' + err.message);
      } finally {
        e.target.value = '';
      }
    });

    // Botón para eliminar / restablecer el Logo actual
    document.getElementById('btn-remove-brand-logo')?.addEventListener('click', () => {
      this.appState.data.branding.logo = '';
      const preview = document.getElementById('preview-brand-logo');
      if (preview) {
        preview.removeAttribute('src');
        preview.style.display = 'none';
      }
      const removeBtn = document.getElementById('btn-remove-brand-logo');
      if (removeBtn) removeBtn.style.display = 'none';
      const logoUrlInput = document.getElementById('brand-input-logo-url');
      if (logoUrlInput) logoUrlInput.value = '';

      this.appState.saveData();
      this.appState.applyBrandingAndTheme();
      this.appState.showToast('Logo eliminado. Mostrando inicial de la marca.', 'info');
      this.triggerGitHubAutoSync('Restablecer logo de la marca');
    });

    // 2. Subida directa de Favicon con persistencia inmediata
    const favInput = document.getElementById('upload-brand-favicon');
    favInput?.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const compressed = await window.ImageOptimizer.compressImage(file, {
          maxDim: 256,
          thumbDim: 128,
          preserveAlpha: true
        });
        const finalFavData = compressed.thumb || compressed.full;
        this.appState.data.branding.favicon = finalFavData;

        const preview = document.getElementById('preview-brand-favicon');
        if (preview) {
          preview.src = finalFavData;
          preview.style.display = 'block';
        }
        const removeFavBtn = document.getElementById('btn-remove-brand-favicon');
        if (removeFavBtn) removeFavBtn.style.display = 'inline-flex';

        this.appState.saveData();
        this.appState.applyBrandingAndTheme();
        this.appState.showToast('Favicon actualizado y guardado ✅', 'success');
        this.triggerGitHubAutoSync('Actualizar favicon de la tienda');
      } catch (err) {
        alert('Error al procesar favicon: ' + err.message);
      } finally {
        e.target.value = '';
      }
    });

    document.getElementById('btn-remove-brand-favicon')?.addEventListener('click', () => {
      this.appState.data.branding.favicon = '';
      const preview = document.getElementById('preview-brand-favicon');
      if (preview) {
        preview.removeAttribute('src');
        preview.style.display = 'none';
      }
      const removeFavBtn = document.getElementById('btn-remove-brand-favicon');
      if (removeFavBtn) removeFavBtn.style.display = 'none';

      this.appState.saveData();
      this.appState.applyBrandingAndTheme();
      this.appState.showToast('Favicon eliminado', 'info');
      this.triggerGitHubAutoSync('Eliminar favicon');
    });
  }

  populateBrandingForms() {
    const b = this.appState.data.branding || {};

    const nameEl = document.getElementById('brand-input-name');
    const taglineEl = document.getElementById('brand-input-tagline');
    const waEl = document.getElementById('brand-input-whatsapp');
    const logoUrlEl = document.getElementById('brand-input-logo-url');

    if (nameEl) nameEl.value = b.name || '';
    if (taglineEl) taglineEl.value = b.tagline || '';
    if (waEl) waEl.value = b.whatsapp || '';
    if (logoUrlEl) {
      logoUrlEl.value = (b.logo && !b.logo.startsWith('data:')) ? b.logo : '';
    }

    const logoPreview = document.getElementById('preview-brand-logo');
    const removeLogoBtn = document.getElementById('btn-remove-brand-logo');
    if (logoPreview) {
      if (b.logo && String(b.logo).trim().length > 0) {
        logoPreview.src = b.logo;
        logoPreview.style.display = 'block';
        if (removeLogoBtn) removeLogoBtn.style.display = 'inline-flex';
      } else {
        logoPreview.removeAttribute('src');
        logoPreview.style.display = 'none';
        if (removeLogoBtn) removeLogoBtn.style.display = 'none';
      }
    }

    const favPreview = document.getElementById('preview-brand-favicon');
    const removeFavBtn = document.getElementById('btn-remove-brand-favicon');
    if (favPreview) {
      if (b.favicon && String(b.favicon).trim().length > 0) {
        favPreview.src = b.favicon;
        favPreview.style.display = 'block';
        if (removeFavBtn) removeFavBtn.style.display = 'inline-flex';
      } else {
        favPreview.removeAttribute('src');
        favPreview.style.display = 'none';
        if (removeFavBtn) removeFavBtn.style.display = 'none';
      }
    }

    const fontPrimarySelect = document.getElementById('brand-font-primary');
    if (fontPrimarySelect) fontPrimarySelect.value = b.fontPrimary || "'Plus Jakarta Sans', sans-serif";

    // Color restringido exclusivamente a tipografía de tags y categorías seleccionadas
    const c = b.colors || {};
    const colTagAccent = document.getElementById('color-tags-categories');
    if (colTagAccent) colTagAccent.value = c.tagsCategories || c.primary || '#2563eb';
  }

  saveBrandingAndStyles() {
    const b = this.appState.data.branding;

    b.name = document.getElementById('brand-input-name')?.value.trim() || 'Nexo Store';
    b.tagline = document.getElementById('brand-input-tagline')?.value.trim() || '';
    b.whatsapp = document.getElementById('brand-input-whatsapp')?.value.trim() || '';
    b.fontPrimary = document.getElementById('brand-font-primary')?.value || "'Plus Jakarta Sans', sans-serif";

    // Si el administrador ingresó una URL externa para el logo, aplicarla y actualizar vista previa
    const manualLogoUrl = document.getElementById('brand-input-logo-url')?.value.trim();
    if (manualLogoUrl) {
      b.logo = manualLogoUrl;
    }

    // Requisito 5: El color modificable se restringe exclusivamente a la tipografía de tags y categorías seleccionadas
    if (!b.colors) b.colors = {};
    const chosenColor = document.getElementById('color-tags-categories')?.value || '#2563eb';
    b.colors.tagsCategories = chosenColor;
    b.colors.primary = chosenColor; // Conservar compatibilidad

    this.appState.saveData();
    this.appState.applyBrandingAndTheme();
    this.populateBrandingForms();
    this.appState.showToast('Identidad, logo y estilos guardados y aplicados con éxito ✨', 'success');
    this.triggerGitHubAutoSync('Actualizar identidad de marca, logo y estilos');
  }

  /**
   * ==========================================
   * 6. SEGURIDAD Y ACCESO
   * ==========================================
   */
  populateSecurityForm() {
    const userField = document.getElementById('admin-change-user');
    if (userField) userField.value = this.appState.data.auth.username || 'admin';
  }

  saveSecurityCredentials() {
    const newUser = document.getElementById('admin-change-user')?.value.trim();
    const newPass = document.getElementById('admin-change-pass')?.value;
    const confirmPass = document.getElementById('admin-change-pass-confirm')?.value;

    if (!newUser) {
      alert('El nombre de usuario no puede estar vacío.');
      return;
    }

    if (newPass) {
      if (newPass.length < 4) {
        alert('La contraseña debe tener al menos 4 caracteres.');
        return;
      }
      if (newPass !== confirmPass) {
        alert('Las contraseñas no coinciden.');
        return;
      }
      this.appState.data.auth.passwordHash = newPass;
    }

    this.appState.data.auth.username = newUser;
    this.appState.saveData();

    document.getElementById('admin-change-pass').value = '';
    document.getElementById('admin-change-pass-confirm').value = '';

    this.appState.showToast('Credenciales de acceso actualizadas con éxito 🔐', 'success');
  }

  /**
   * ==========================================
   * 7. RESPALDO Y EXPORTACIÓN JSON
   * ==========================================
   */
  exportJsonBackup() {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(this.appState.data, null, 2));
    const dlAnchor = document.createElement('a');
    dlAnchor.setAttribute('href', dataStr);
    dlAnchor.setAttribute('download', `nexo-catalogo-${Date.now()}.json`);
    document.body.appendChild(dlAnchor);
    dlAnchor.click();
    dlAnchor.remove();
    this.appState.showToast('Copia de seguridad JSON descargada', 'success');
  }

  importJsonBackup(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(e.target.result);
        if (parsed.branding && parsed.products) {
          this.appState.data = parsed;
          this.appState.saveData();
          this.renderProductsTable();
          this.renderCategoriesList();
          this.populateBrandingForms();
          this.appState.applyBrandingAndTheme();
          this.appState.catalogManager.init();
          this.appState.showToast('Configuración y catálogo importados con éxito', 'success');
        } else {
          alert('El archivo JSON no tiene la estructura válida de NexoApp.');
        }
      } catch (err) {
        alert('Error al procesar el archivo JSON: ' + err.message);
      }
    };
    reader.readAsText(file);
  }

  /**
   * ==========================================
   * 8. SINCRONIZACIÓN AUTOMÁTICA GITHUB & NETLIFY
   * ==========================================
   */
  populateGitHubForm() {
    if (!this.appState.githubSync) return;
    const config = this.appState.githubSync.getConfig();

    const ownerEl = document.getElementById('github-input-owner');
    const repoEl = document.getElementById('github-input-repo');
    const branchEl = document.getElementById('github-input-branch');
    const pathEl = document.getElementById('github-input-path');
    const tokenEl = document.getElementById('github-input-token');
    const enabledEl = document.getElementById('github-check-enabled');
    const autocommitEl = document.getElementById('github-check-autocommit');

    if (ownerEl) ownerEl.value = config.owner || 'guilleadyc';
    if (repoEl) repoEl.value = config.repo || 'NexoApp';
    if (branchEl) branchEl.value = config.branch || 'main';
    if (pathEl) pathEl.value = config.path || 'data/catalog.json';
    if (tokenEl) tokenEl.value = config.token || '';
    if (enabledEl) enabledEl.checked = config.enabled !== undefined ? config.enabled : true;
    if (autocommitEl) autocommitEl.checked = config.autoCommit !== undefined ? config.autoCommit : true;
  }

  updateGitHubStatusBanner(customStatus = null, customMessage = null) {
    if (!this.appState.githubSync) return;
    const config = this.appState.githubSync.getConfig();

    const badge = document.getElementById('github-status-badge');
    const dot = document.getElementById('github-status-dot');
    const title = document.getElementById('github-status-title');
    const detail = document.getElementById('github-status-detail');
    const repoLink = document.getElementById('github-meta-repo');
    const branchMeta = document.getElementById('github-meta-branch');
    const fileMeta = document.getElementById('github-meta-file');
    const commitMeta = document.getElementById('github-meta-commit');

    const fullName = `${config.owner || 'guilleadyc'}/${config.repo || 'NexoApp'}`;

    if (repoLink) {
      repoLink.innerHTML = `<a href="https://github.com/${fullName}" target="_blank" rel="noopener">${fullName} ↗</a>`;
    }
    if (branchMeta) branchMeta.textContent = config.branch || 'main';
    if (fileMeta) fileMeta.textContent = config.path || 'data/catalog.json';

    if (commitMeta) {
      if (config.lastCommitAt) {
        const date = new Date(config.lastCommitAt);
        const timeAgo = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const shaShort = config.lastCommitSha ? config.lastCommitSha.substring(0, 7) : '';
        commitMeta.innerHTML = `<span title="${config.lastCommitAt}">Hoy a las ${timeAgo} (${shaShort}) ✅</span>`;
      } else {
        commitMeta.textContent = 'Sin commits recientes';
      }
    }

    if (customStatus === 'testing') {
      if (badge) { badge.className = 'status-pill-badge status-testing'; badge.textContent = '🔄 Verificando...'; }
      if (dot) dot.className = 'status-circle status-testing';
      if (title) title.textContent = 'Probando conexión con GitHub...';
      if (detail) detail.textContent = 'Verificando repositorio y permisos del token.';
      return;
    }

    if (customStatus === 'syncing') {
      if (badge) { badge.className = 'status-pill-badge status-syncing'; badge.textContent = '☁️ Enviando commit...'; }
      if (dot) dot.className = 'status-circle status-syncing';
      if (title) title.textContent = 'Guardando cambios en GitHub...';
      if (detail) detail.textContent = customMessage || 'Creando commit en la rama ' + config.branch;
      return;
    }

    if (customStatus === 'error') {
      if (badge) { badge.className = 'status-pill-badge status-error'; badge.textContent = '🔴 Error'; }
      if (dot) dot.className = 'status-circle status-error';
      if (title) title.textContent = 'Error de Conexión';
      if (detail) detail.textContent = customMessage || 'Revisa tu token o nombre de repositorio.';
      return;
    }

    if (!config.token) {
      if (badge) { badge.className = 'status-pill-badge status-warning'; badge.textContent = '🟡 No configurado'; }
      if (dot) dot.className = 'status-circle status-warning';
      if (title) title.textContent = 'Token no configurado';
      if (detail) detail.textContent = 'Ingresa tu Token de GitHub a la izquierda para activar los commits automáticos.';
    } else if (!config.enabled) {
      if (badge) { badge.className = 'status-pill-badge status-paused'; badge.textContent = '⏸️ Sincronización Pausada'; }
      if (dot) dot.className = 'status-circle status-paused';
      if (title) title.textContent = 'Sincronización deshabilitada';
      if (detail) detail.textContent = 'Marca la casilla "Activar Sincronización" para habilitar los commits.';
    } else {
      if (badge) { badge.className = 'status-pill-badge status-connected'; badge.textContent = '🟢 Conectado'; }
      if (dot) dot.className = 'status-circle status-connected';
      if (title) title.textContent = 'Conectado y Listo';
      if (detail) detail.textContent = `Los cambios se guardan automáticamente en ${fullName} (rama ${config.branch}).`;
    }
  }

  async saveGitHubSettings() {
    if (!this.appState.githubSync) return;

    const owner = document.getElementById('github-input-owner')?.value.trim();
    const repo = document.getElementById('github-input-repo')?.value.trim();
    const branch = document.getElementById('github-input-branch')?.value.trim() || 'main';
    const path = document.getElementById('github-input-path')?.value.trim() || 'data/catalog.json';
    const token = document.getElementById('github-input-token')?.value.trim();
    const enabled = document.getElementById('github-check-enabled')?.checked;
    const autoCommit = document.getElementById('github-check-autocommit')?.checked;

    this.appState.githubSync.saveConfig({
      owner, repo, branch, path, token, enabled, autoCommit
    });

    this.appState.showToast('Configuración de GitHub guardada localmente', 'info');

    if (token && enabled) {
      this.testGitHubConnection();
    } else {
      this.updateGitHubStatusBanner();
    }
  }

  async testGitHubConnection() {
    if (!this.appState.githubSync) return;

    const owner = document.getElementById('github-input-owner')?.value.trim();
    const repo = document.getElementById('github-input-repo')?.value.trim();
    const branch = document.getElementById('github-input-branch')?.value.trim() || 'main';
    const path = document.getElementById('github-input-path')?.value.trim() || 'data/catalog.json';
    const token = document.getElementById('github-input-token')?.value.trim();

    if (!token) {
      alert('Por favor ingresa tu Token de Acceso Personal de GitHub para probar la conexión.');
      return;
    }

    this.updateGitHubStatusBanner('testing');

    try {
      const res = await this.appState.githubSync.testConnection({ owner, repo, branch, path, token });
      this.appState.githubSync.saveConfig({ owner, repo, branch, path, token, enabled: true });
      this.appState.showToast(`✅ ${res.message}`, 'success');
      this.updateGitHubStatusBanner();
    } catch (err) {
      this.updateGitHubStatusBanner('error', err.message);
      alert('Error al conectar con GitHub:\n\n' + err.message);
    }
  }

  async syncCatalogToGitHubNow() {
    if (!this.appState.githubSync) return;
    const config = this.appState.githubSync.getConfig();

    if (!config.token) {
      alert('Antes de sincronizar, ingresa tu Token de GitHub y pulsa en "Guardar Configuración".');
      return;
    }

    const btn = document.getElementById('btn-github-sync-now');
    if (btn) btn.disabled = true;

    this.appState.showToast('☁️ Enviando catálogo completo a GitHub...', 'info');
    this.updateGitHubStatusBanner('syncing');

    try {
      const res = await this.appState.githubSync.commitCatalog(this.appState.data, 'Sincronización manual completa del catálogo');
      this.appState.showToast('🚀 ¡Catálogo sincronizado con GitHub! Netlify publicará la web en vivo.', 'success');
      this.updateGitHubStatusBanner();
    } catch (err) {
      alert('Error en la sincronización:\n' + err.message);
      this.updateGitHubStatusBanner('error', err.message);
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async triggerGitHubAutoSync(actionReason) {
    if (!this.appState.githubSync) return;
    const config = this.appState.githubSync.getConfig();

    // Si no está habilitado o no hay token o autoCommit está apagado, salimos en silencio
    if (!config.enabled || !config.token || config.autoCommit === false) {
      return;
    }

    this.appState.showToast('☁️ Guardando cambios en GitHub...', 'info');
    this.updateGitHubStatusBanner('syncing', actionReason);

    try {
      const res = await this.appState.githubSync.commitCatalog(this.appState.data, actionReason);
      if (res && res.success) {
        this.appState.showToast('🚀 ¡Guardado en GitHub! Netlify desplegará los cambios en vivo.', 'success');
        this.updateGitHubStatusBanner();
      }
    } catch (err) {
      console.error('Error en auto-commit a GitHub:', err);
      this.appState.showToast(`⚠️ No se pudo enviar a GitHub: ${err.message}`, 'warning');
      this.updateGitHubStatusBanner('error', err.message);
    }
  }
}

window.AdminManager = AdminManager;
