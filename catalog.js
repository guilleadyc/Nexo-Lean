/**
 * catalog.js - Gestor del Catálogo y E-Commerce General (NexoApp)
 * Controla la visualización de productos en Cuadrícula y Feed Inmersivo,
 * separación de imagen de portada vs galería secundaria, métrica de popularidad
 * acumulada («Me gusta»), y visor modal Lightbox expandible con swipe/zoom.
 */

class CatalogManager {
  constructor(appState) {
    this.appState = appState;
    this.activeCategory = 'all';
    this.searchQuery = '';
    this.activeFilter = 'all'; // 'all' | 'offers' | 'bestsellers' | 'new'
    this.sortBy = 'default';   // 'default' | 'price-asc' | 'price-desc' | 'name-asc' | 'likes-desc'
    this.viewMode = 'grid';    // 'grid' | 'reels'
    
    // Control de sesión / votación local para evitar votos duplicados
    this.votedLikes = new Set(JSON.parse(localStorage.getItem('nexo_user_voted_likes') || '[]'));

    // Estado del Lightbox Pantalla Completa
    this.lightboxItems = [];
    this.lightboxIndex = 0;
    this.lightboxZoomed = false;
    this.touchStartX = 0;
    this.touchStartY = 0;
  }

  init() {
    this.renderCategoryNav();
    this.renderContent();
    this.setupEventListeners();
    this.setupLightboxGlobalEvents();
  }

  setupEventListeners() {
    // Selector de modo Cuadrícula vs Reels / Feed
    document.getElementById('btn-view-grid')?.addEventListener('click', () => this.setViewMode('grid'));
    document.getElementById('btn-view-reels')?.addEventListener('click', () => this.setViewMode('reels'));

    // Buscador instantáneo con placeholder "Buscar"
    const searchInput = document.getElementById('catalog-search-input');
    searchInput?.addEventListener('input', (e) => {
      this.searchQuery = e.target.value.toLowerCase().trim();
      this.renderContent();
    });

    document.getElementById('btn-clear-search')?.addEventListener('click', () => {
      if (searchInput) searchInput.value = '';
      this.searchQuery = '';
      this.renderContent();
    });

    // Selector de Ordenamiento
    const sortSelect = document.getElementById('catalog-sort-select');
    sortSelect?.addEventListener('change', (e) => {
      this.sortBy = e.target.value;
      this.renderContent();
    });

    // Filtros Rápidos (Ofertas, Más Vendidos, etc.)
    document.querySelectorAll('.filter-pill-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const filter = e.currentTarget.getAttribute('data-filter');
        this.setFilter(filter);
      });
    });
  }

  setFilter(filter) {
    this.activeFilter = filter;
    document.querySelectorAll('.filter-pill-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-filter') === filter);
    });
    this.renderContent();
  }

  setViewMode(mode) {
    if (this.viewMode === mode) return;
    this.viewMode = mode;

    const btnGrid = document.getElementById('btn-view-grid');
    const btnReels = document.getElementById('btn-view-reels');
    const container = document.getElementById('catalog-viewport');

    if (mode === 'grid') {
      btnGrid?.classList.add('active');
      btnReels?.classList.remove('active');
      container?.classList.remove('view-mode-reels');
      container?.classList.add('view-mode-grid');
    } else {
      btnGrid?.classList.remove('active');
      btnReels?.classList.add('active');
      container?.classList.remove('view-mode-grid');
      container?.classList.add('view-mode-reels');
    }

    this.renderContent();

    if (mode === 'reels') {
      this.appState.showToast('📱 Modo Feed: Desliza verticalmente para ver los productos', 'info');
    }
  }

  renderCategoryNav() {
    const navEl = document.getElementById('category-scroll-bar');
    if (!navEl) return;

    const categories = this.appState.data.categories || [];

    let html = `
      <button class="cat-pill ${this.activeCategory === 'all' ? 'active' : ''}" data-cat-id="all">
        <span class="cat-icon">🏷️</span>
        <span class="cat-name">Todos los Productos</span>
      </button>
    `;

    categories.forEach(cat => {
      const isActive = this.activeCategory === cat.id;
      html += `
        <button class="cat-pill ${isActive ? 'active' : ''}" data-cat-id="${cat.id}">
          <span class="cat-icon">${cat.icon || '📦'}</span>
          <span class="cat-name">${cat.name}</span>
        </button>
      `;
    });

    navEl.innerHTML = html;

    navEl.querySelectorAll('.cat-pill').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const catId = e.currentTarget.getAttribute('data-cat-id');
        this.selectCategory(catId);
      });
    });
  }

  selectCategory(catId) {
    this.activeCategory = catId;
    this.renderCategoryNav();
    this.renderContent();
  }

  /**
   * Normaliza un elemento multimedia (ya sea string URL o objeto { type, url, thumb })
   * para garantizar retrocompatibilidad absoluta entre el catálogo heredado y futuras importaciones.
   */
  normalizeMediaItem(item) {
    if (!item) return null;
    if (typeof item === 'string') {
      const cleanUrl = item.trim();
      if (!cleanUrl) return null;
      const isVideo = Boolean(cleanUrl.match(/\.(mp4|webm|ogg|mov)($|\?)/i));
      return {
        type: isVideo ? 'video' : 'image',
        url: cleanUrl,
        thumb: cleanUrl
      };
    }
    if (typeof item === 'object' && item.url) {
      const cleanUrl = String(item.url).trim();
      const isVideo = item.type === 'video' || Boolean(cleanUrl.match(/\.(mp4|webm|ogg|mov)($|\?)/i));
      return {
        type: isVideo ? 'video' : 'image',
        url: cleanUrl,
        thumb: item.thumb || cleanUrl,
        name: item.name || ''
      };
    }
    return null;
  }

  /**
   * Resuelve la portada principal de un producto (compatible con coverImage, image y media[0] heredado)
   */
  getCoverMedia(prod) {
    if (!prod) {
      return {
        type: 'image',
        url: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800',
        thumb: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400'
      };
    }

    if (prod.coverImage) {
      const normalized = this.normalizeMediaItem({
        url: prod.coverImage,
        thumb: prod.thumb || prod.coverImage
      });
      if (normalized) return normalized;
    }

    if (prod.image) {
      const normalized = this.normalizeMediaItem(prod.image);
      if (normalized) return normalized;
    }

    if (prod.media && Array.isArray(prod.media) && prod.media.length > 0) {
      const normalized = this.normalizeMediaItem(prod.media[0]);
      if (normalized) return normalized;
    }

    return {
      type: 'image',
      url: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800',
      thumb: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400'
    };
  }

  /**
   * Resuelve la galería secundaria multimedia (fotos y videos adicionales de muestra)
   * Compatible tanto con prod.gallery (nuevo esquema) como con prod.media.slice(1) (esquema heredado)
   */
  getSecondaryGallery(prod) {
    if (!prod) return [];

    if (prod.gallery && Array.isArray(prod.gallery) && prod.gallery.length > 0) {
      return prod.gallery.map(item => this.normalizeMediaItem(item)).filter(Boolean);
    }

    if (prod.media && Array.isArray(prod.media) && prod.media.length > 1) {
      return prod.media.slice(1).map(item => this.normalizeMediaItem(item)).filter(Boolean);
    }

    return [];
  }

  /**
   * Retorna todos los recursos multimedia unificados para el Lightbox (Portada + Galería)
   */
  getAllMediaList(prod) {
    const cover = this.getCoverMedia(prod);
    const secondary = this.getSecondaryGallery(prod);
    return [cover, ...secondary];
  }

  getFilteredProducts() {
    let list = [...(this.appState.data.products || [])];

    // Filtro por Categoría
    if (this.activeCategory !== 'all') {
      list = list.filter(p => p.categoryId === this.activeCategory);
    }

    // Filtro Rápido (Ofertas, Más Vendidos, Nuevo)
    if (this.activeFilter === 'offers') {
      list = list.filter(p => p.salePrice && p.salePrice < p.basePrice);
    } else if (this.activeFilter === 'bestsellers') {
      list = list.filter(p => (p.badge || '').toLowerCase().includes('vendido') || (p.badge || '').toLowerCase().includes('top') || (p.likes || 0) > 50);
    } else if (this.activeFilter === 'new') {
      list = list.filter(p => (p.badge || '').toLowerCase().includes('nuevo') || (p.badge || '').toLowerCase().includes('lanzamiento'));
    }

    // Búsqueda Dinámica Multicampo (Título, SKU, Categoría, Tags, Especificaciones)
    if (this.searchQuery) {
      const q = this.searchQuery;
      list = list.filter(p => {
        const titleMatch = (p.name || '').toLowerCase().includes(q);
        const skuMatch = (p.sku || '').toLowerCase().includes(q);
        const descMatch = (p.description || '').toLowerCase().includes(q);
        const catObj = this.appState.data.categories.find(c => c.id === p.categoryId);
        const catMatch = catObj ? catObj.name.toLowerCase().includes(q) : false;
        const tagMatch = (p.tags || []).some(t => t.toLowerCase().includes(q));
        const specMatch = (p.specs || []).some(s => `${s.key}: ${s.value}`.toLowerCase().includes(q));

        return titleMatch || skuMatch || descMatch || catMatch || tagMatch || specMatch;
      });
    }

    // Ordenamiento
    if (this.sortBy === 'price-asc') {
      list.sort((a, b) => (a.salePrice || a.basePrice) - (b.salePrice || b.basePrice));
    } else if (this.sortBy === 'price-desc') {
      list.sort((a, b) => (b.salePrice || b.basePrice) - (a.salePrice || a.basePrice));
    } else if (this.sortBy === 'name-asc') {
      list.sort((a, b) => a.name.localeCompare(b.name));
    } else if (this.sortBy === 'likes-desc') {
      list.sort((a, b) => (b.likes || 0) - (a.likes || 0));
    }

    return list;
  }

  renderContent() {
    const container = document.getElementById('catalog-viewport');
    if (!container) return;

    const products = this.getFilteredProducts();

    // Contador de resultados
    const countEl = document.getElementById('results-count-text');
    if (countEl) {
      countEl.textContent = `${products.length} producto${products.length === 1 ? '' : 's'} disponible${products.length === 1 ? '' : 's'}`;
    }

    if (products.length === 0) {
      container.innerHTML = `
        <div class="empty-catalog-state">
          <div class="empty-icon">🔍</div>
          <h3>No se encontraron productos</h3>
          <p>Prueba con otros términos de búsqueda o cambia la categoría seleccionada.</p>
          <button class="btn-primary-ghost" onclick="window.app.catalogManager.resetFilters()">Restablecer Filtros</button>
        </div>
      `;
      return;
    }

    if (this.viewMode === 'grid') {
      this.renderGridView(container, products);
    } else {
      this.renderReelsView(container, products);
    }
  }

  resetFilters() {
    this.activeCategory = 'all';
    this.activeFilter = 'all';
    this.searchQuery = '';
    this.sortBy = 'default';
    const input = document.getElementById('catalog-search-input');
    if (input) input.value = '';
    const sort = document.getElementById('catalog-sort-select');
    if (sort) sort.value = 'default';
    this.renderCategoryNav();
    document.querySelectorAll('.filter-pill-btn').forEach(b => b.classList.toggle('active', b.getAttribute('data-filter') === 'all'));
    this.renderContent();
  }

  getCategoryName(catId) {
    const c = this.appState.data.categories.find(item => item.id === catId);
    return c ? c.name : 'General';
  }

  /**
   * Renderiza la vista de Cuadrícula E-Commerce con Portada, Métrica de Likes y Badges
   */
  renderGridView(container, products) {
    let html = '<div class="catalog-grid-layout">';

    products.forEach(prod => {
      const isLiked = this.votedLikes.has(prod.id);
      const likesCount = prod.likes || 0;
      const cover = this.getCoverMedia(prod);
      const secondaryGallery = this.getSecondaryGallery(prod);
      const hasDiscount = prod.salePrice && prod.salePrice < prod.basePrice;
      const discountPercent = hasDiscount ? Math.round(((prod.basePrice - prod.salePrice) / prod.basePrice) * 100) : 0;

      // Badges
      let badgesHtml = '';
      if (prod.badge) {
        badgesHtml += `<span class="badge-custom-pill">${prod.badge}</span>`;
      }
      if (hasDiscount) {
        badgesHtml += `<span class="badge-discount-pill">-${discountPercent}%</span>`;
      }

      // Indicador de galería multimedia secundaria
      let galleryIndicatorHtml = '';
      if (secondaryGallery.length > 0) {
        const hasVideo = secondaryGallery.some(m => m.type === 'video');
        galleryIndicatorHtml = `
          <span class="card-gallery-count-pill" title="${secondaryGallery.length} archivos adicionales en galería">
            ${hasVideo ? '🎥' : '📷'} +${secondaryGallery.length}
          </span>
        `;
      }

      html += `
        <article class="product-card" data-prod-id="${prod.id}">
          <div class="product-media-wrap" onclick="window.app.catalogManager.openProductDetail('${prod.id}')">
            ${cover.type === 'video'
              ? `<video class="card-video" playsinline loop muted autoplay poster="${cover.thumb || cover.url}">
                   <source src="${cover.url}" type="video/mp4">
                 </video>`
              : `<img src="${cover.thumb || cover.url}" alt="${prod.name}" class="card-img" loading="lazy" />`
            }

            <div class="product-badges-overlay">
              ${badgesHtml}
            </div>

            ${galleryIndicatorHtml}

            <!-- Botón interactivo de «Me gusta» con métrica pública acumulada -->
            <button class="btn-fav-pill ${isLiked ? 'liked' : ''}" 
                    onclick="event.stopPropagation(); window.app.catalogManager.toggleLike('${prod.id}')" 
                    title="${isLiked ? 'Ya no me gusta' : 'Me gusta'}">
              <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="${isLiked ? '#ef4444' : 'none'}" stroke-width="2">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
              </svg>
              <span class="like-counter-num" id="like-count-${prod.id}">${likesCount}</span>
            </button>
          </div>

          <div class="product-info-wrap" onclick="window.app.catalogManager.openProductDetail('${prod.id}')">
            <div class="product-meta-row">
              <span class="product-cat-label">${this.getCategoryName(prod.categoryId)}</span>
              ${prod.sku ? `<span class="product-sku-label">SKU: ${prod.sku}</span>` : ''}
            </div>

            <h3 class="product-title">${prod.name}</h3>

            <p class="product-desc-snippet">${prod.description}</p>

            ${prod.specs && prod.specs.length > 0 ? `
              <div class="product-quick-specs">
                ${prod.specs.slice(0, 2).map(s => `<span class="spec-micro-tag"><strong>${s.key}:</strong> ${s.value}</span>`).join('')}
              </div>
            ` : ''}

            <div class="product-card-footer">
              <div class="price-container">
                ${hasDiscount
                  ? `<span class="price-original">$${prod.basePrice.toFixed(2)}</span>
                     <span class="price-sale">$${prod.salePrice.toFixed(2)}</span>`
                  : `<span class="price-regular">$${prod.basePrice.toFixed(2)}</span>`
                }
              </div>
              <button class="btn-view-product" onclick="event.stopPropagation(); window.app.catalogManager.openProductDetail('${prod.id}')">
                Ver Ficha
              </button>
            </div>
          </div>
        </article>
      `;
    });

    html += '</div>';
    container.innerHTML = html;
  }

  /**
   * Renderiza la vista de Feed / Reels Inmersivo
   */
  renderReelsView(container, products) {
    let html = '<div class="feed-reels-container" id="feed-reels-track">';

    products.forEach((prod, index) => {
      const isLiked = this.votedLikes.has(prod.id);
      const likesCount = prod.likes || 0;
      const cover = this.getCoverMedia(prod);
      const hasDiscount = prod.salePrice && prod.salePrice < prod.basePrice;

      const mediaHtml = cover.type === 'video'
        ? `<video class="reel-media-bg" playsinline loop muted autoplay poster="${cover.thumb || cover.url}">
             <source src="${cover.url}" type="video/mp4">
           </video>`
        : `<img class="reel-media-bg" src="${cover.url}" alt="${prod.name}" loading="${index < 2 ? 'eager' : 'lazy'}" />`;

      html += `
        <section class="feed-reel-slide" id="feed-slide-${index}" data-prod-id="${prod.id}">
          ${mediaHtml}
          <div class="feed-scrim-gradient"></div>

          <!-- Header Flotante del Reel -->
          <div class="feed-top-bar">
            <div class="feed-cat-pill">
              <span>${this.getCategoryName(prod.categoryId)}</span>
              ${prod.badge ? `<span class="feed-badge">${prod.badge}</span>` : ''}
            </div>
            <div class="feed-price-pill">
              ${hasDiscount ? `$${prod.salePrice.toFixed(2)}` : `$${prod.basePrice.toFixed(2)}`}
            </div>
          </div>

          <!-- Acciones Laterales Flotantes con Likes Acumulados -->
          <div class="feed-side-actions">
            <button class="feed-action-btn ${isLiked ? 'liked' : ''}" 
                    onclick="window.app.catalogManager.toggleLike('${prod.id}')" 
                    title="${isLiked ? 'Quitar Me gusta' : 'Dar Me gusta'}">
              <div class="action-circle">
                <svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" fill="${isLiked ? '#ef4444' : 'none'}" stroke-width="2">
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                </svg>
              </div>
              <span class="action-counter" id="feed-like-count-${prod.id}">${likesCount}</span>
            </button>

            <button class="feed-action-btn" onclick="window.app.catalogManager.openProductDetail('${prod.id}')" title="Ficha Completa">
              <div class="action-circle">
                <svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" fill="none" stroke-width="2">
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="12" y1="16" x2="12" y2="12"></line>
                  <line x1="12" y1="8" x2="12.01" y2="8"></line>
                </svg>
              </div>
              <span class="action-counter">Ficha</span>
            </button>

            <button class="feed-action-btn" onclick="window.app.catalogManager.shareProduct('${prod.id}')" title="Compartir">
              <div class="action-circle">
                <svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" fill="none" stroke-width="2">
                  <circle cx="18" cy="5" r="3"></circle>
                  <circle cx="6" cy="12" r="3"></circle>
                  <circle cx="18" cy="19" r="3"></circle>
                  <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
                  <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
                </svg>
              </div>
              <span class="action-counter">Copiar</span>
            </button>
          </div>

          <!-- Información Inferior del Producto -->
          <div class="feed-bottom-info">
            <div class="feed-sku-tag">SKU: ${prod.sku}</div>
            <h2 class="feed-title">${prod.name}</h2>
            <p class="feed-description">${prod.description}</p>

            ${prod.specs && prod.specs.length > 0 ? `
              <div class="feed-specs-pills">
                ${prod.specs.slice(0, 3).map(s => `<span class="feed-spec-item">${s.key}: ${s.value}</span>`).join('')}
              </div>
            ` : ''}

            <div class="feed-nav-bar">
              <span class="feed-progress-text">${index + 1} de ${products.length}</span>
              <div class="feed-chevrons">
                ${index > 0 ? `<button class="btn-feed-nav" onclick="window.app.catalogManager.scrollToReel(${index - 1})" title="Anterior">▲</button>` : ''}
                ${index < products.length - 1 ? `<button class="btn-feed-nav" onclick="window.app.catalogManager.scrollToReel(${index + 1})" title="Siguiente">▼</button>` : ''}
              </div>
            </div>
          </div>
        </section>
      `;
    });

    html += '</div>';
    container.innerHTML = html;
  }

  scrollToReel(index) {
    const target = document.getElementById(`feed-slide-${index}`);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth' });
    }
  }

  /**
   * ==========================================
   * 1. INTERACCIÓN Y POPULARIDAD («Me gusta»)
   * ==========================================
   * Persiste el conteo acumulado en el producto y controla la sesión local
   */
  toggleLike(prodId) {
    const prod = (this.appState.data.products || []).find(p => p.id === prodId);
    if (!prod) return;

    if (!prod.likes) prod.likes = 0;

    const hasVoted = this.votedLikes.has(prodId);

    if (hasVoted) {
      // Quitar Me gusta
      this.votedLikes.delete(prodId);
      prod.likes = Math.max(0, prod.likes - 1);
      this.appState.showToast('Eliminado de tus «Me gusta»', 'info');
    } else {
      // Dar Me gusta
      this.votedLikes.add(prodId);
      prod.likes += 1;
      this.appState.showToast('¡Te gusta este producto! ❤️', 'success');
    }

    // Persistir votos del usuario localmente para evitar votos duplicados
    localStorage.setItem('nexo_user_voted_likes', JSON.stringify([...this.votedLikes]));

    // Persistir conteo acumulado en la base de datos/almacenamiento para todos los clientes
    this.appState.saveData();

    // Actualizar elementos visuales en pantalla sin recargar todo el DOM
    const cardCounter = document.getElementById(`like-count-${prodId}`);
    if (cardCounter) cardCounter.textContent = prod.likes;

    const feedCounter = document.getElementById(`feed-like-count-${prodId}`);
    if (feedCounter) feedCounter.textContent = prod.likes;

    const detailPill = document.getElementById(`detail-likes-pill-${prodId}`);
    if (detailPill) {
      detailPill.classList.toggle('liked', !hasVoted);
      detailPill.querySelector('.detail-likes-text').textContent = `${prod.likes} ${prod.likes === 1 ? 'persona recomienda' : 'personas recomiendan'} este producto`;
    }

    // Actualizar botones de like
    document.querySelectorAll(`.product-card[data-prod-id="${prodId}"] .btn-fav-pill`).forEach(btn => {
      btn.classList.toggle('liked', !hasVoted);
      btn.querySelector('svg').setAttribute('fill', !hasVoted ? '#ef4444' : 'none');
    });

    document.querySelectorAll(`.feed-reel-slide[data-prod-id="${prodId}"] .feed-action-btn`).forEach(btn => {
      btn.classList.toggle('liked', !hasVoted);
      btn.querySelector('svg').setAttribute('fill', !hasVoted ? '#ef4444' : 'none');
    });
  }

  shareProduct(prodId) {
    const url = window.location.href.split('#')[0] + `?prod=${prodId}`;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(() => {
        this.appState.showToast('¡Enlace del producto copiado al portapapeles! 📋', 'success');
      });
    } else {
      this.appState.showToast('Enlace listo para compartir', 'info');
    }
  }

  /**
   * ==========================================
   * 2. FICHA DE PRODUCTO & GALERÍA MULTIMEDIA
   * ==========================================
   * Separa Portada Principal de la Galería Secundaria y soporta Fotos y Videos
   */
  openProductDetail(prodId) {
    const prod = (this.appState.data.products || []).find(p => p.id === prodId);
    if (!prod) return;

    const modal = document.getElementById('modal-product-detail');
    const content = document.getElementById('product-detail-modal-body');
    if (!modal || !content) return;

    const isLiked = this.votedLikes.has(prod.id);
    const likesCount = prod.likes || 0;
    const cover = this.getCoverMedia(prod);
    const secondaryGallery = this.getSecondaryGallery(prod);
    const allMedia = this.getAllMediaList(prod);

    const hasDiscount = prod.salePrice && prod.salePrice < prod.basePrice;
    const discountPercent = hasDiscount ? Math.round(((prod.basePrice - prod.salePrice) / prod.basePrice) * 100) : 0;

    // Renderizar Galería Secundaria (separada de la portada)
    let secondaryGalleryHtml = '';
    if (secondaryGallery.length > 0) {
      secondaryGalleryHtml = `
        <div class="detail-secondary-gallery-box">
          <div class="secondary-gallery-header">
            <h4>Galería Multimedia Adicional (${secondaryGallery.length})</h4>
            <span class="gallery-hint">Toca cualquier foto o video para abrir en pantalla completa</span>
          </div>
          <div class="secondary-gallery-grid">
            ${secondaryGallery.map((m, idx) => {
              const globalIndex = idx + 1; // +1 porque el índice 0 es la portada
              const isVideo = m.type === 'video';
              return `
                <div class="secondary-gallery-thumb ${isVideo ? 'is-video-thumb' : ''}" 
                     onclick="window.app.catalogManager.openLightboxFromProduct('${prod.id}', ${globalIndex})"
                     title="Ver en pantalla completa">
                  ${isVideo 
                    ? `<video src="${m.url}" preload="metadata" muted></video>
                       <div class="media-type-tag video-tag">🎥 Video</div>
                       <div class="play-overlay-icon">▶</div>`
                    : `<img src="${m.thumb || m.url}" alt="${prod.name} - Imagen ${globalIndex}" loading="lazy" />
                       <div class="media-type-tag photo-tag">📷 Foto</div>`
                  }
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
    }

    // Renderizar Especificaciones Dinámicas
    const specsHtml = (prod.specs && prod.specs.length > 0)
      ? `
        <div class="detail-specs-section">
          <h4 class="detail-section-title">Especificaciones Técnicas</h4>
          <div class="detail-specs-grid">
            ${prod.specs.map(s => `
              <div class="spec-attribute-card">
                <span class="spec-attr-key">${s.key}</span>
                <span class="spec-attr-val">${s.value}</span>
              </div>
            `).join('')}
          </div>
        </div>
      `
      : '';

    // Renderizar Tags
    const tagsHtml = (prod.tags && prod.tags.length > 0)
      ? `
        <div class="detail-tags-wrap">
          ${prod.tags.map(t => `<span class="detail-tag-pill">#${t}</span>`).join('')}
        </div>
      `
      : '';

    content.innerHTML = `
      <div class="product-detail-layout">
        <!-- Columna Izquierda: Imagen de Portada Principal y Galería Secundaria -->
        <div class="product-gallery-column">
          
          <!-- Portada Principal Destacada -->
          <div class="detail-cover-wrapper">
            <div class="detail-cover-hero" onclick="window.app.catalogManager.openLightboxFromProduct('${prod.id}', 0)" title="Abrir en pantalla completa">
              ${cover.type === 'video'
                ? `<video class="cover-hero-media" controls playsinline src="${cover.url}"></video>`
                : `<img class="cover-hero-media" src="${cover.url}" alt="${prod.name}" />`
              }
              <button class="btn-fullscreen-trigger" onclick="event.stopPropagation(); window.app.catalogManager.openLightboxFromProduct('${prod.id}', 0)" title="Ampliar pantalla completa">
                🔍 Pantalla Completa
              </button>
            </div>
            <div class="cover-caption-row">
              <span class="cover-label">Imagen Principal / Portada</span>
              <span class="total-assets-count">1 de ${allMedia.length} archivos multimedia</span>
            </div>
          </div>

          <!-- Galería Secundaria de Fotos y Videos (Separada) -->
          ${secondaryGalleryHtml}
        </div>

        <!-- Columna Derecha: Información, Métrica de Popularidad y Especificaciones -->
        <div class="product-meta-column">
          <div class="detail-top-meta">
            <span class="detail-category-badge">${this.getCategoryName(prod.categoryId)}</span>
            ${prod.sku ? `<span class="detail-sku-badge">SKU: ${prod.sku}</span>` : ''}
          </div>

          <h1 class="detail-title">${prod.name}</h1>

          <!-- Métrica de Popularidad («Me gusta» acumulados) -->
          <div class="detail-likes-pill ${isLiked ? 'liked' : ''}" id="detail-likes-pill-${prod.id}" onclick="window.app.catalogManager.toggleLike('${prod.id}')" title="Haz clic para votar o desmarcar">
            <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" fill="${isLiked ? '#ef4444' : 'none'}" stroke-width="2">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
            </svg>
            <span class="detail-likes-text">${likesCount} ${likesCount === 1 ? 'persona recomienda' : 'personas recomiendan'} este producto</span>
          </div>

          <div class="detail-price-box">
            ${hasDiscount
              ? `
                <div class="detail-sale-row">
                  <span class="detail-sale-price">$${prod.salePrice.toFixed(2)}</span>
                  <span class="detail-base-price">$${prod.basePrice.toFixed(2)}</span>
                  <span class="detail-discount-tag">Ahorras $${(prod.basePrice - prod.salePrice).toFixed(2)} (-${discountPercent}%)</span>
                </div>
              `
              : `<span class="detail-regular-price">$${prod.basePrice.toFixed(2)}</span>`
            }
          </div>

          <div class="detail-description">
            <h4 class="detail-section-title">Descripción</h4>
            <p>${prod.description}</p>
          </div>

          ${specsHtml}
          ${tagsHtml}

          <!-- Botón de Acción Principal -->
          <div class="detail-actions-tray">
            <button class="btn-primary-action" onclick="window.app.catalogManager.inquireProduct('${prod.id}')">
              <span>💬 Consultar Disponibilidad / Comprar</span>
            </button>
            <button class="btn-share-round" onclick="window.app.catalogManager.shareProduct('${prod.id}')" title="Compartir producto">
              <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" fill="none" stroke-width="2">
                <circle cx="18" cy="5" r="3"></circle>
                <circle cx="6" cy="12" r="3"></circle>
                <circle cx="18" cy="19" r="3"></circle>
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
              </svg>
            </button>
          </div>
        </div>
      </div>
    `;

    this.appState.openModal('modal-product-detail');
  }

  /**
   * ==========================================
   * 3. VISOR MODAL LIGHTBOX EN PANTALLA COMPLETA
   * ==========================================
   * Soporta fotos y videos, zoom, swipe táctil en móvil y flechas en escritorio
   */
  openLightboxFromProduct(prodId, initialIndex = 0) {
    const prod = (this.appState.data.products || []).find(p => p.id === prodId);
    if (!prod) return;

    const allMedia = this.getAllMediaList(prod);
    this.openLightbox(allMedia, initialIndex, prod.name);
  }

  openLightbox(items, initialIndex = 0, productTitle = '') {
    if (!items || items.length === 0) return;

    this.lightboxItems = items;
    this.lightboxIndex = Math.max(0, Math.min(initialIndex, items.length - 1));
    this.lightboxZoomed = false;

    const modal = document.getElementById('modal-lightbox');
    if (!modal) return;

    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';

    const titleEl = document.getElementById('lightbox-title-text');
    if (titleEl) titleEl.textContent = productTitle || 'Visor Multimedia';

    this.renderLightboxCurrent();
  }

  renderLightboxCurrent() {
    const container = document.getElementById('lightbox-stage');
    const counterEl = document.getElementById('lightbox-counter-text');
    if (!container) return;

    const current = this.lightboxItems[this.lightboxIndex];
    if (!current) return;

    const total = this.lightboxItems.length;
    const isVideo = current.type === 'video';

    if (counterEl) {
      counterEl.textContent = `${isVideo ? '🎥 Video' : '📷 Foto'} ${this.lightboxIndex + 1} de ${total}`;
    }

    this.lightboxZoomed = false;

    if (isVideo) {
      container.innerHTML = `
        <div class="lightbox-video-wrapper">
          <video class="lightbox-video-player" controls autoplay playsinline src="${current.url}"></video>
        </div>
      `;
    } else {
      container.innerHTML = `
        <div class="lightbox-image-wrapper" id="lightbox-img-wrap" ondblclick="window.app.catalogManager.toggleLightboxZoom()">
          <img class="lightbox-image-element" id="lightbox-active-img" src="${current.url}" alt="Vista ampliada" />
        </div>
      `;
    }
  }

  nextLightbox() {
    if (this.lightboxItems.length <= 1) return;
    this.lightboxIndex = (this.lightboxIndex + 1) % this.lightboxItems.length;
    this.renderLightboxCurrent();
  }

  prevLightbox() {
    if (this.lightboxItems.length <= 1) return;
    this.lightboxIndex = (this.lightboxIndex - 1 + this.lightboxItems.length) % this.lightboxItems.length;
    this.renderLightboxCurrent();
  }

  toggleLightboxZoom() {
    const imgWrap = document.getElementById('lightbox-img-wrap');
    if (!imgWrap) return;
    this.lightboxZoomed = !this.lightboxZoomed;
    imgWrap.classList.toggle('zoomed', this.lightboxZoomed);
  }

  closeLightbox() {
    const modal = document.getElementById('modal-lightbox');
    if (!modal) return;

    // Pausar cualquier video reproduciéndose
    const video = modal.querySelector('video');
    if (video) video.pause();

    modal.classList.add('hidden');
    // Si el modal de detalle del producto sigue abierto, mantener overflow hidden
    const detailModal = document.getElementById('modal-product-detail');
    if (!detailModal || detailModal.classList.contains('hidden')) {
      document.body.style.overflow = '';
    }
  }

  setupLightboxGlobalEvents() {
    document.getElementById('btn-lightbox-close')?.addEventListener('click', () => this.closeLightbox());
    document.getElementById('btn-lightbox-prev')?.addEventListener('click', () => this.prevLightbox());
    document.getElementById('btn-lightbox-next')?.addEventListener('click', () => this.nextLightbox());
    document.getElementById('btn-lightbox-zoom')?.addEventListener('click', () => this.toggleLightboxZoom());

    // Clic en backdrop para cerrar
    document.getElementById('lightbox-backdrop')?.addEventListener('click', () => this.closeLightbox());

    // Teclas de flecha y escape en escritorio
    window.addEventListener('keydown', (e) => {
      const modal = document.getElementById('modal-lightbox');
      if (!modal || modal.classList.contains('hidden')) return;

      if (e.key === 'ArrowRight') {
        e.preventDefault();
        this.nextLightbox();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        this.prevLightbox();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        this.closeLightbox();
      }
    });

    // Gestos táctiles de deslizamiento (Swipe) para smartphones en Lightbox
    const stage = document.getElementById('lightbox-stage');
    if (stage) {
      stage.addEventListener('touchstart', (e) => {
        const touch = e.touches[0];
        this.touchStartX = touch.clientX;
        this.touchStartY = touch.clientY;
      }, { passive: true });

      stage.addEventListener('touchend', (e) => {
        if (!e.changedTouches || e.changedTouches.length === 0) return;
        const touch = e.changedTouches[0];
        const diffX = touch.clientX - this.touchStartX;
        const diffY = touch.clientY - this.touchStartY;

        // Umbral de swipe horizontal de 40px y mayor que el vertical
        if (Math.abs(diffX) > 40 && Math.abs(diffX) > Math.abs(diffY)) {
          if (diffX < 0) {
            this.nextLightbox(); // Deslizar hacia la izquierda -> siguiente
          } else {
            this.prevLightbox(); // Deslizar hacia la derecha -> anterior
          }
        }
      }, { passive: true });
    }
  }

  inquireProduct(prodId) {
    const prod = (this.appState.data.products || []).find(p => p.id === prodId);
    if (!prod) return;

    const brandName = this.appState.data.branding.name || 'la tienda';
    const msg = `¡Hola! Me interesa obtener más información o realizar el pedido del producto: *${prod.name}* (SKU: ${prod.sku}), con valor de $${(prod.salePrice || prod.basePrice).toFixed(2)}.`;

    this.appState.showToast(`Mensaje de consulta preparado para "${prod.name}"`, 'success');

    if (this.appState.data.branding.whatsapp) {
      const cleanPhone = this.appState.data.branding.whatsapp.replace(/[^0-9]/g, '');
      const waUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`;
      window.open(waUrl, '_blank');
    }
  }
}

window.CatalogManager = CatalogManager;
