/**
 * app.js - Núcleo y Controlador Principal de NexoApp E-Commerce
 * 
 * ARQUITECTURA DE PERSISTENCIA:
 * - Almacenamiento local mediante Web Storage API (localStorage) para catálogo, marca blanca,
 *   categorías, autenticación, likes acumulados y preferencias visuales.
 * - Soporta persistencia de imágenes en Base64 WebP optimizadas y almacenamiento de thumbnails.
 * - Para conectar un backend REST / GraphQL o base de datos en producción (PostgreSQL, Supabase, Firebase, Node.js),
 *   basta con sustituir los métodos `loadData()` y `saveData()` por llamadas a endpoints `fetch('/api/catalog')`.
 */

const DEFAULT_STATE = {
  auth: {
    username: "admin",
    passwordHash: "admin123", // Contraseña por defecto personalizable desde el panel
    lastLogin: null
  },
  branding: {
    name: "Nexo Store",
    tagline: "Tecnología, Diseño & Estilo de Vida",
    logo: "", // Base64 o URL personalizada
    favicon: "",
    banner: "",
    whatsapp: "+1234567890", // Número para consultas directas de clientes
    fontPrimary: "'Plus Jakarta Sans', sans-serif",
    theme: "dark", // 'dark' | 'light' | 'auto'
    colors: {
      tagsCategories: "#2563eb", // Requisito 5: Color restringido exclusivamente a tipografía de tags y categorías seleccionadas
      primary: "#2563eb",
      badgeBg: "#ef4444",        // Rojo intenso de oferta / badge
      badgeText: "#ffffff"       // Texto de badge
    }
  },
  categories: [
    { id: "cat_audio", name: "Audio & Sonido Pro", icon: "🎧" },
    { id: "cat_wearables", name: "Smartwatches & Wearables", icon: "⌚" },
    { id: "cat_home", name: "Hogar Inteligente & Diseño", icon: "🛋️" },
    { id: "cat_gear", name: "Accesorios & Movilidad", icon: "🎒" }
  ],
  products: [
    {
      id: "prod_1",
      sku: "NX-AUD-01",
      name: "Auriculares Inalámbricos Studio Pro ANC",
      categoryId: "cat_audio",
      basePrice: 249.99,
      salePrice: 199.99,
      badge: "Más Vendido",
      description: "Auriculares over-ear con cancelación activa de ruido híbrida de 42dB, transductores de grafeno de 40mm, audio espacial de 360 grados y hasta 55 horas de reproducción ininterrumpida.",
      coverImage: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=1200&auto=format&fit=crop&q=80",
      thumb: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400&auto=format&fit=crop&q=80",
      gallery: [
        { type: "image", url: "https://images.unsplash.com/photo-1484704849700-f032a568e944?w=1200&auto=format&fit=crop&q=80", thumb: "https://images.unsplash.com/photo-1484704849700-f032a568e944?w=400" },
        { type: "image", url: "https://images.unsplash.com/photo-1546435770-a3e426bf472b?w=1200&auto=format&fit=crop&q=80", thumb: "https://images.unsplash.com/photo-1546435770-a3e426bf472b?w=400" }
      ],
      media: [
        { type: "image", url: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=1200&auto=format&fit=crop&q=80" },
        { type: "image", url: "https://images.unsplash.com/photo-1484704849700-f032a568e944?w=1200&auto=format&fit=crop&q=80" },
        { type: "image", url: "https://images.unsplash.com/photo-1546435770-a3e426bf472b?w=1200&auto=format&fit=crop&q=80" }
      ],
      specs: [
        { key: "Marca", value: "AcousticLab" },
        { key: "Conectividad", value: "Bluetooth 5.3 + Cable Jack 3.5mm" },
        { key: "Cancelación de Ruido", value: "Híbrida Activa 42dB" },
        { key: "Batería", value: "55 Horas (Carga rápida USB-C)" },
        { key: "Peso", value: "245 g" },
        { key: "Garantía", value: "2 Años Oficial" },
        { key: "Disponibilidad", value: "En Stock Inmediato" }
      ],
      tags: ["audio", "auriculares", "bluetooth", "anc", "hi-res"],
      likes: 84
    },
    {
      id: "prod_2",
      sku: "NX-WAT-02",
      name: "Smartwatch Titanium Horizon Ultra",
      categoryId: "cat_wearables",
      basePrice: 320.00,
      salePrice: 269.00,
      badge: "Oferta",
      description: "Reloj inteligente con caja de titanio aeroespacial, cristal de zafiro irrayable, pantalla Always-On AMOLED de 1.43 pulgadas, GPS de doble frecuencia y sensor biométrico de ECG y oxígeno.",
      coverImage: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=1200&auto=format&fit=crop&q=80",
      thumb: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400&auto=format&fit=crop&q=80",
      gallery: [
        { type: "image", url: "https://images.unsplash.com/photo-1546868871-7041f2a55e12?w=1200&auto=format&fit=crop&q=80", thumb: "https://images.unsplash.com/photo-1546868871-7041f2a55e12?w=400" }
      ],
      media: [
        { type: "image", url: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=1200&auto=format&fit=crop&q=80" },
        { type: "image", url: "https://images.unsplash.com/photo-1546868871-7041f2a55e12?w=1200&auto=format&fit=crop&q=80" }
      ],
      specs: [
        { key: "Material de Caja", value: "Titanio Grado 5" },
        { key: "Cristal", value: "Zafiro Sintético" },
        { key: "Resistencia al Agua", value: "10 ATM (100 Metros)" },
        { key: "Autonomía", value: "Hasta 14 Días" },
        { key: "Compatibilidad", value: "iOS y Android" },
        { key: "Sensores", value: "ECG, SpO2, Temperatura, Altímetro" }
      ],
      tags: ["reloj", "smartwatch", "titanio", "fitness", "gps"],
      likes: 126
    },
    {
      id: "prod_3",
      sku: "NX-HOM-03",
      name: "Lámpara de Mesa Escandinava Lumio Glow",
      categoryId: "cat_home",
      basePrice: 119.00,
      salePrice: null,
      badge: "Diseño Exclusivo",
      description: "Lámpara arquitectónica minimalista con base de roble macizo sostenible, difusor de vidrio opalino soplado artesanalmente y control táctil de intensidad lumínica regulable.",
      coverImage: "https://images.unsplash.com/photo-1507473885765-e6ed057f782c?w=1200&auto=format&fit=crop&q=80",
      thumb: "https://images.unsplash.com/photo-1507473885765-e6ed057f782c?w=400&auto=format&fit=crop&q=80",
      gallery: [
        { type: "image", url: "https://images.unsplash.com/photo-1513506003901-1e6a229e2d15?w=1200&auto=format&fit=crop&q=80", thumb: "https://images.unsplash.com/photo-1513506003901-1e6a229e2d15?w=400" }
      ],
      media: [
        { type: "image", url: "https://images.unsplash.com/photo-1507473885765-e6ed057f782c?w=1200&auto=format&fit=crop&q=80" },
        { type: "image", url: "https://images.unsplash.com/photo-1513506003901-1e6a229e2d15?w=1200&auto=format&fit=crop&q=80" }
      ],
      specs: [
        { key: "Materiales", value: "Roble Natural & Vidrio Opalino" },
        { key: "Temperatura de Luz", value: "2200K - 3000K (Cálida Regulable)" },
        { key: "Potencia", value: "LED 8W integrado (50.000 horas)" },
        { key: "Dimensiones", value: "28 cm x 18 cm" },
        { key: "Voltaje", value: "110V - 240V Universal" }
      ],
      tags: ["iluminacion", "lampara", "nordico", "madera", "hogar"],
      likes: 47
    },
    {
      id: "prod_4",
      sku: "NX-BAG-04",
      name: "Mochila Urbana Impermeable Veloce Pack 26L",
      categoryId: "cat_gear",
      basePrice: 139.50,
      salePrice: 109.90,
      badge: "Nuevo",
      description: "Mochila técnica para trabajo y viajes confeccionada en tejido Cordura 1000D resistente al agua. Compartimento acolchado para portátiles de hasta 16 pulgadas y apertura clamshell de 180°.",
      coverImage: "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=1200&auto=format&fit=crop&q=80",
      thumb: "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=400&auto=format&fit=crop&q=80",
      gallery: [
        { type: "image", url: "https://images.unsplash.com/photo-1622560480605-d83c853bc5c3?w=1200&auto=format&fit=crop&q=80", thumb: "https://images.unsplash.com/photo-1622560480605-d83c853bc5c3?w=400" }
      ],
      media: [
        { type: "image", url: "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=1200&auto=format&fit=crop&q=80" },
        { type: "image", url: "https://images.unsplash.com/photo-1622560480605-d83c853bc5c3?w=1200&auto=format&fit=crop&q=80" }
      ],
      specs: [
        { key: "Capacidad", value: "26 Litros" },
        { key: "Material", value: "Cordura 1000D Hidrófugo" },
        { key: "Compartimento Laptop", value: "Hasta 16 Pulgadas" },
        { key: "Cremalleras", value: "YKK Aquaguard Impermeables" },
        { key: "Peso", value: "850 g" }
      ],
      tags: ["mochila", "viaje", "laptop", "impermeable", "cordura"],
      likes: 95
    },
    {
      id: "prod_5",
      sku: "NX-KEY-05",
      name: "Teclado Mecánico Custom Apex 75%",
      categoryId: "cat_audio",
      basePrice: 185.00,
      salePrice: 155.00,
      badge: "Garantía Oficial",
      description: "Teclado mecánico premium con estructura Gasket Mount amortiguada por silicona multicapa, switches lineales pre-lubricados, perilla de volumen de aluminio y triple conectividad (2.4Ghz, Bluetooth, USB-C).",
      coverImage: "https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=1200&auto=format&fit=crop&q=80",
      thumb: "https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=400&auto=format&fit=crop&q=80",
      gallery: [
        { type: "image", url: "https://images.unsplash.com/photo-1618384887929-16ec33fab9ef?w=1200&auto=format&fit=crop&q=80", thumb: "https://images.unsplash.com/photo-1618384887929-16ec33fab9ef?w=400" }
      ],
      media: [
        { type: "image", url: "https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=1200&auto=format&fit=crop&q=80" },
        { type: "image", url: "https://images.unsplash.com/photo-1618384887929-16ec33fab9ef?w=1200&auto=format&fit=crop&q=80" }
      ],
      specs: [
        { key: "Formato", value: "75% Compacto (82 Teclas + Knob)" },
        { key: "Montaje", value: "Gasket Mount con 5 capas de Poron" },
        { key: "Switches", value: "Lineales Lubrificados (Hotswap)" },
        { key: "Keycaps", value: "PBT Dye-Sub de perfil Cherry" },
        { key: "Batería", value: "4000 mAh" }
      ],
      tags: ["teclado", "mecanico", "custom", "gaming", "setup"],
      likes: 110
    },
    {
      id: "prod_6",
      sku: "NX-CAM-06",
      name: "Cámara Instantánea Compacta Retro Snap 4K",
      categoryId: "cat_wearables",
      basePrice: 99.00,
      salePrice: null,
      badge: "Popular",
      description: "Combina la magia de la fotografía instantánea analógica con un sensor digital de alta definición. Permite previsualizar en pantalla antes de imprimir o guardar en tarjeta microSD.",
      coverImage: "https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?w=1200&auto=format&fit=crop&q=80",
      thumb: "https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?w=400&auto=format&fit=crop&q=80",
      gallery: [],
      media: [
        { type: "image", url: "https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?w=1200&auto=format&fit=crop&q=80" }
      ],
      specs: [
        { key: "Tecnología de Impresión", value: "ZINK Zero Ink (Sin tinta)" },
        { key: "Resolución", value: "16 Megapíxeles / Video 4K" },
        { key: "Pantalla", value: "LCD 2.5 pulgadas a color" },
        { key: "Almacenamiento", value: "MicroSD hasta 128GB" }
      ],
      tags: ["camara", "instantanea", "retro", "fotografia"],
      likes: 72
    }
  ]
};

class App {
  constructor() {
    this.data = this.loadData();
    this.activeTheme = localStorage.getItem('nexo_theme') || this.data.branding.theme || 'dark';
    this.githubSync = window.GitHubSync ? new window.GitHubSync(this) : null;
    this.catalogManager = null;
    this.catalogImporter = null;
    this.adminManager = null;
  }

  loadData() {
    try {
      const saved = localStorage.getItem('nexo_ecommerce_data');
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          ...DEFAULT_STATE,
          ...parsed,
          auth: { ...DEFAULT_STATE.auth, ...(parsed.auth || {}) },
          branding: {
            ...DEFAULT_STATE.branding,
            ...(parsed.branding || {}),
            colors: {
              ...DEFAULT_STATE.branding.colors,
              ...((parsed.branding && parsed.branding.colors) || {})
            }
          },
          categories: parsed.categories && parsed.categories.length > 0 ? parsed.categories : DEFAULT_STATE.categories,
          products: parsed.products && parsed.products.length > 0 ? parsed.products : DEFAULT_STATE.products
        };
      }
    } catch (e) {
      console.warn('Error leyendo localStorage, utilizando configuración predeterminada.', e);
    }
    return JSON.parse(JSON.stringify(DEFAULT_STATE));
  }

  saveData() {
    try {
      // Actualizar marca de tiempo para garantizar que los cambios locales (ej: logo, branding, productos)
      // nunca sean sobrescritos por versiones estáticas anteriores de data/catalog.json
      this.data.updatedAt = new Date().toISOString();
      localStorage.setItem('nexo_ecommerce_data', JSON.stringify(this.data));
    } catch (e) {
      console.error('Error guardando datos:', e);
      if (e.name === 'QuotaExceededError') {
        alert('Se ha superado el límite de almacenamiento local. La compresión WebP automática previene este problema en imágenes optimizadas.');
      }
    }
  }

  resetToDefaultData() {
    this.data = JSON.parse(JSON.stringify(DEFAULT_STATE));
    this.saveData();
    this.applyBrandingAndTheme();
    if (this.catalogManager) this.catalogManager.init();
  }

  init() {
    // 1. Aplicar marca blanca, fuentes y temas
    this.applyBrandingAndTheme();

    // 2. Instanciar módulos del sistema
    this.catalogImporter = new CatalogImporter(this);
    this.catalogManager = new CatalogManager(this);
    this.adminManager = new AdminManager(this);

    // 3. Inicializar catálogo y administración
    this.catalogManager.init();
    this.adminManager.init();

    // 4. Configurar eventos globales
    this.setupGlobalEvents();
    this.setupPwa();

    // 5. Sincronizar catálogo en vivo desde el repositorio remoto en GitHub/Netlify
    this.syncRemoteCatalog();

    // Exponer instancia global para handlers de eventos
    window.app = this;
  }

  /**
   * Sincroniza el catálogo en vivo desde el archivo data/catalog.json desplegado por Netlify
   */
  async syncRemoteCatalog() {
    try {
      const res = await fetch(`./data/catalog.json?_t=${Date.now()}`);
      if (res.ok) {
        const remote = await res.json();
        if (remote && Array.isArray(remote.products) && remote.products.length > 0) {
          const localDataRaw = localStorage.getItem('nexo_ecommerce_data');
          const remoteTime = remote.updatedAt ? new Date(remote.updatedAt).getTime() : 0;
          const localTime = this.data.updatedAt ? new Date(this.data.updatedAt).getTime() : 0;

          // Solo actualizar desde el remoto si no hay datos locales previos o si el remoto es estrictamente más reciente
          if (!localDataRaw || remoteTime > localTime) {
            const remoteBranding = remote.branding || {};
            this.data = {
              ...this.data,
              branding: {
                ...this.data.branding,
                ...remoteBranding,
                // Preservar logo y favicon locales si el remoto viene vacío
                logo: remoteBranding.logo ? remoteBranding.logo : (this.data.branding?.logo || ''),
                favicon: remoteBranding.favicon ? remoteBranding.favicon : (this.data.branding?.favicon || ''),
                colors: {
                  ...(this.data.branding?.colors || {}),
                  ...(remoteBranding.colors || {})
                }
              },
              categories: remote.categories || this.data.categories,
              products: remote.products || this.data.products,
              updatedAt: remote.updatedAt || new Date().toISOString()
            };
            localStorage.setItem('nexo_ecommerce_data', JSON.stringify(this.data));
            this.applyBrandingAndTheme();
            if (this.catalogManager) {
              this.catalogManager.renderCategoryNav();
              this.catalogManager.renderContent();
            }
            console.log('✅ Catálogo sincronizado en vivo desde GitHub / Netlify.');
          }
        }
      }
    } catch (err) {
      console.log('Catálogo activo en modo local offline:', err);
    }
  }

  setupGlobalEvents() {
    // Selector Dinámico de Tema (Oscuro / Claro / Auto)
    document.querySelectorAll('.theme-toggle-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const selectedTheme = e.currentTarget.getAttribute('data-theme');
        this.setTheme(selectedTheme);
      });
    });

    // Cerrar modales con botones .modal-close y clics fuera en el backdrop
    document.querySelectorAll('.modal-close, .modal-backdrop').forEach(el => {
      el.addEventListener('click', (e) => {
        const modal = e.target.closest('.modal-container');
        if (modal) {
          this.closeModal(modal.id);
        }
      });
    });

    // Tecla Escape para cerrar modales (excepto si el lightbox lo maneja)
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const lightbox = document.getElementById('modal-lightbox');
        if (lightbox && !lightbox.classList.contains('hidden')) {
          this.catalogManager?.closeLightbox();
        } else {
          this.closeAllModals();
        }
      }
    });

    // Escuchar cambios de preferencia del sistema si el tema es 'auto'
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (this.activeTheme === 'auto') {
        this.applyBrandingAndTheme();
      }
    });
  }

  setTheme(theme) {
    this.activeTheme = theme;
    localStorage.setItem('nexo_theme', theme);
    this.applyBrandingAndTheme();
    this.showToast(`Tema cambiado a: ${theme === 'dark' ? 'Modo Oscuro' : theme === 'light' ? 'Modo Claro' : 'Automático'}`, 'info');
  }

  /**
   * Aplica dinámicamente:
   * 1. Modo Oscuro / Claro
   * 2. Tipografías seleccionadas
   * 3. Requisito 5: Restringe el color modificable EXCLUSIVAMENTE a la tipografía de tags y categorías seleccionadas (--color-tag-accent).
   * 4. Textos y logos de Marca Blanca
   */
  applyBrandingAndTheme() {
    const root = document.documentElement;
    const b = this.data.branding;
    const colors = b.colors || {};

    // 1. Resolver tema efectivo
    let effectiveTheme = this.activeTheme;
    if (this.activeTheme === 'auto') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      effectiveTheme = prefersDark ? 'dark' : 'light';
    }
    root.setAttribute('data-theme', effectiveTheme);

    // 2. Requisito 5: Color para tipografía de etiquetas (tags) y categorías seleccionadas
    const tagAccentColor = colors.tagsCategories || colors.primary || '#2563eb';
    root.style.setProperty('--color-tag-accent', tagAccentColor);

    // Sincronización de badges (fondo y texto)
    if (colors.badgeBg) {
      root.style.setProperty('--color-badge-bg', colors.badgeBg);
    }
    if (colors.badgeText) {
      root.style.setProperty('--color-badge-text', colors.badgeText);
    }

    // 3. Tipografía Dinámica
    if (b.fontPrimary) {
      root.style.setProperty('--font-primary', b.fontPrimary);
      this.ensureGoogleFontLoaded(b.fontPrimary);
    }

    // 4. Branding en cabecera y título
    document.querySelectorAll('.brand-display-name').forEach(el => { el.textContent = b.name || 'Nexo Store'; });
    document.querySelectorAll('.brand-display-tagline').forEach(el => { el.textContent = b.tagline || ''; });

    const hasValidLogo = Boolean(b.logo && String(b.logo).trim().length > 0);
    const logoEls = document.querySelectorAll('.brand-display-logo');
    const logoFallbackEls = document.querySelectorAll('.brand-logo-fallback');

    logoFallbackEls.forEach(el => {
      el.style.display = hasValidLogo ? 'none' : 'flex';
      el.textContent = (b.name || 'N').charAt(0).toUpperCase();
    });

    logoEls.forEach(img => {
      if (hasValidLogo) {
        img.src = b.logo;
        img.style.display = 'block';
        img.onerror = () => {
          img.style.display = 'none';
          logoFallbackEls.forEach(fb => { fb.style.display = 'flex'; });
        };
      } else {
        img.removeAttribute('src');
        img.style.display = 'none';
      }
    });

    // Favicon dinámico
    if (b.favicon) {
      let favLink = document.querySelector("link[rel*='icon']");
      if (!favLink) {
        favLink = document.createElement('link');
        favLink.rel = 'icon';
        document.head.appendChild(favLink);
      }
      favLink.href = b.favicon;
    }

    document.title = `${b.name} — Catálogo E-Commerce`;

    // 5. Botones de tema activos
    document.querySelectorAll('.theme-toggle-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-theme') === this.activeTheme);
    });
  }

  ensureGoogleFontLoaded(fontFamily) {
    const cleanName = fontFamily.replace(/['",]/g, '').split(' ')[0].trim();
    if (!cleanName || cleanName === 'sans-serif' || cleanName === 'system-ui') return;

    const id = `gfont-${cleanName.toLowerCase()}`;
    if (!document.getElementById(id)) {
      const link = document.createElement('link');
      link.id = id;
      link.rel = 'stylesheet';
      link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(cleanName)}:wght@400;500;600;700;800&display=swap`;
      document.head.appendChild(link);
    }
  }

  openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }

  closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    modal.classList.add('hidden');
    document.body.style.overflow = '';
  }

  closeAllModals() {
    document.querySelectorAll('.modal-container').forEach(m => m.classList.add('hidden'));
    document.body.style.overflow = '';
  }

  showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast-pill toast-${type}`;
    toast.innerHTML = `
      <span class="toast-icon">${type === 'success' ? '✅' : type === 'warning' ? '⚠️' : '✨'}</span>
      <span class="toast-text">${message}</span>
    `;

    container.appendChild(toast);

    setTimeout(() => toast.classList.add('visible'), 10);
    setTimeout(() => {
      toast.classList.remove('visible');
      setTimeout(() => toast.remove(), 250);
    }, 3200);
  }

  setupPwa() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').catch(err => {
          console.log('ServiceWorker no disponible en este entorno:', err);
        });
      });
    }
  }
}

// Iniciar aplicación al estar listo el DOM
document.addEventListener('DOMContentLoaded', () => {
  const app = new App();
  app.init();
});
