/**
 * github-sync.js - Motor de Sincronización Automática con GitHub API & Netlify
 * Permite que cada cambio en el Panel Admin (guardar, editar, eliminar productos,
 * categorías, marcas o importaciones) se envíe directamente al repositorio en GitHub.
 * Netlify detecta el nuevo commit y despliega los cambios en vivo automáticamente.
 */

class GitHubSync {
  constructor(appState) {
    this.appState = appState;
    this.storageKey = 'nexo_github_config';
    this.isCommitting = false;
    this.pendingCommit = null;
  }

  /**
   * Obtiene la configuración actual de GitHub
   */
  getConfig() {
    const defaults = {
      enabled: false,
      owner: 'guilleadyc',
      repo: 'NexoApp',
      branch: 'main',
      path: 'data/catalog.json',
      token: '',
      autoCommit: true,
      lastCommitAt: null,
      lastCommitSha: null
    };

    try {
      const saved = localStorage.getItem(this.storageKey);
      if (saved) {
        return { ...defaults, ...JSON.parse(saved) };
      }
    } catch (e) {
      console.warn('Error leyendo nexo_github_config de localStorage:', e);
    }
    return defaults;
  }

  /**
   * Guarda la configuración de GitHub en el almacenamiento local del administrador
   */
  saveConfig(newConfig) {
    const current = this.getConfig();
    const updated = {
      ...current,
      ...newConfig,
      owner: newConfig.owner ? newConfig.owner.trim() : current.owner,
      repo: newConfig.repo ? newConfig.repo.trim() : current.repo,
      branch: newConfig.branch ? newConfig.branch.trim() : (current.branch || 'main'),
      path: newConfig.path ? newConfig.path.trim() : (current.path || 'data/catalog.json'),
      token: newConfig.token ? newConfig.token.trim() : current.token,
      enabled: newConfig.enabled !== undefined ? Boolean(newConfig.enabled) : current.enabled,
      autoCommit: newConfig.autoCommit !== undefined ? Boolean(newConfig.autoCommit) : current.autoCommit
    };

    localStorage.setItem(this.storageKey, JSON.stringify(updated));
    return updated;
  }

  /**
   * Codifica strings Unicode / UTF-8 a Base64 de forma segura
   * (indispensable para acentos, eñes y emojis en descripciones de productos)
   */
  utf8ToBase64(str) {
    return window.btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (match, p1) => {
      return String.fromCharCode('0x' + p1);
    }));
  }

  /**
   * Decodifica Base64 a string UTF-8
   */
  base64ToUtf8(str) {
    return decodeURIComponent(Array.prototype.map.call(window.atob(str), (c) => {
      return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));
  }

  /**
   * Cabeceras comunes para la API de GitHub
   */
  getHeaders(token) {
    const cleanToken = (token || '').trim();
    return {
      'Authorization': `Bearer ${cleanToken}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json'
    };
  }

  /**
   * Prueba la conexión con el repositorio y valida los permisos del Token
   */
  async testConnection(customConfig = null) {
    const config = customConfig || this.getConfig();
    const { owner, repo, branch, token } = config;

    if (!token) {
      throw new Error('Debes ingresar tu Token de Acceso Personal de GitHub.');
    }
    if (!owner || !repo) {
      throw new Error('Debes ingresar el Usuario/Organización y el Nombre del Repositorio.');
    }

    // 1. Verificar acceso al repositorio
    const repoUrl = `https://api.github.com/repos/${owner}/${repo}`;
    const repoRes = await fetch(repoUrl, {
      headers: this.getHeaders(token)
    });

    if (repoRes.status === 401) {
      throw new Error('Token de GitHub inválido o expirado. Genera uno nuevo con permisos de repositorio.');
    }
    if (repoRes.status === 404) {
      throw new Error(`No se encontró el repositorio "${owner}/${repo}". Verifica que el nombre esté bien escrito y que el token tenga acceso.`);
    }
    if (!repoRes.ok) {
      throw new Error(`Error ${repoRes.status} al consultar el repositorio en GitHub.`);
    }

    const repoData = await repoRes.json();

    // 2. Verificar permisos de escritura
    if (repoData.permissions && repoData.permissions.push === false) {
      throw new Error('El token es válido pero solo tiene permiso de lectura. Necesita permisos de escritura (Contents: Read and write o scope "repo").');
    }

    // 3. Verificar existencia de la rama
    const branchUrl = `https://api.github.com/repos/${owner}/${repo}/branches/${branch || 'main'}`;
    const branchRes = await fetch(branchUrl, {
      headers: this.getHeaders(token)
    });

    if (branchRes.status === 404) {
      throw new Error(`La rama "${branch || 'main'}" no existe en el repositorio.`);
    }

    return {
      success: true,
      repoName: repoData.full_name,
      isPrivate: repoData.private,
      defaultBranch: repoData.default_branch,
      permissions: repoData.permissions,
      message: `¡Conexión exitosa con ${repoData.full_name}! Permisos de escritura verificados.`
    };
  }

  /**
   * Obtiene el SHA actual del archivo en GitHub (necesario para actualizarlo sin conflictos)
   */
  async getFileSha() {
    const { owner, repo, branch, path, token } = this.getConfig();
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch || 'main'}&_t=${Date.now()}`;

    const res = await fetch(url, {
      headers: this.getHeaders(token)
    });

    if (res.status === 200) {
      const data = await res.json();
      return data.sha;
    }
    if (res.status === 404) {
      // El archivo aún no existe en el repo, se creará por primera vez
      return null;
    }
    if (res.status === 401) {
      throw new Error('Token de GitHub no autorizado o expirado.');
    }
    throw new Error(`Error ${res.status} al verificar el archivo "${path}" en GitHub.`);
  }

  /**
   * Envía el catálogo actual a GitHub mediante un commit a la API
   * @param {Object} data - Objeto de datos del catálogo
   * @param {string} actionReason - Motivo descriptivo del commit
   */
  async commitCatalog(data, actionReason = 'Actualización desde Panel Admin') {
    const config = this.getConfig();

    if (!config.enabled || !config.token) {
      return { skipped: true, reason: 'Sincronización con GitHub deshabilitada o token no configurado.' };
    }

    // Si ya hay un commit en progreso, encolamos el más reciente
    if (this.isCommitting) {
      this.pendingCommit = { data, actionReason };
      return { queued: true };
    }

    this.isCommitting = true;

    try {
      const { owner, repo, branch, path, token } = config;

      // 1. Preparar contenido limpio para el JSON del repositorio
      // (NUNCA incluir tokens ni contraseñas de admin en el catálogo público)
      const cleanCatalog = {
        branding: data.branding || {},
        categories: data.categories || [],
        products: data.products || [],
        updatedAt: new Date().toISOString(),
        version: "2.0"
      };

      const jsonString = JSON.stringify(cleanCatalog, null, 2);
      const base64Content = this.utf8ToBase64(jsonString);

      // 2. Obtener SHA actual del archivo
      let sha = await this.getFileSha();

      // 3. Crear commit en GitHub
      const commitUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
      const commitMessage = `🛒 Catálogo: ${actionReason} [Netlify Auto-Deploy]`;

      const requestBody = {
        message: commitMessage,
        content: base64Content,
        branch: branch || 'main'
      };

      if (sha) {
        requestBody.sha = sha;
      }

      let res = await fetch(commitUrl, {
        method: 'PUT',
        headers: this.getHeaders(token),
        body: JSON.stringify(requestBody)
      });

      // Manejar posible conflicto de SHA (si hubo un commit concurrente)
      if (res.status === 409) {
        console.warn('Conflicto 409 de SHA en GitHub, reintentando con el SHA más reciente...');
        sha = await this.getFileSha();
        if (sha) requestBody.sha = sha;
        res = await fetch(commitUrl, {
          method: 'PUT',
          headers: this.getHeaders(token),
          body: JSON.stringify(requestBody)
        });
      }

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || `Error ${res.status} al guardar en GitHub`);
      }

      const result = await res.json();
      const commitSha = result.commit?.sha || '';
      const commitHtmlUrl = result.commit?.html_url || `https://github.com/${owner}/${repo}/commit/${commitSha}`;

      // 4. Actualizar metadatos de sincronización
      this.saveConfig({
        lastCommitAt: new Date().toISOString(),
        lastCommitSha: commitSha
      });

      console.log(`✅ Commit creado en GitHub (${commitSha.substring(0, 7)}). Netlify iniciará despliegue.`);

      return {
        success: true,
        sha: commitSha,
        commitUrl: commitHtmlUrl,
        message: '¡Cambios guardados en GitHub con éxito! Netlify está desplegando la web en vivo 🚀'
      };

    } catch (err) {
      console.error('Error al sincronizar con GitHub:', err);
      throw err;
    } finally {
      this.isCommitting = false;

      // Si había cambios encolados mientras se realizaba el commit, los ejecutamos ahora
      if (this.pendingCommit) {
        const next = this.pendingCommit;
        this.pendingCommit = null;
        return this.commitCatalog(next.data, next.actionReason);
      }
    }
  }

  /**
   * Descarga el archivo de catálogo directamente desde GitHub si está disponible
   */
  async fetchRemoteCatalog() {
    const config = this.getConfig();
    const { owner, repo, branch, path } = config;

    // 1. Primero intentar cargar el archivo local que Netlify sirve estáticamente
    try {
      const localRes = await fetch(`./data/catalog.json?_t=${Date.now()}`);
      if (localRes.ok) {
        const data = await localRes.json();
        if (data && Array.isArray(data.products) && data.products.length > 0) {
          return data;
        }
      }
    } catch (e) {
      // Ignorar, fallback a API o local
    }

    // 2. Si no está en ruta relativa local y hay configuración de GitHub, consultar API
    if (owner && repo && config.token) {
      try {
        const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch || 'main'}/${path}?_t=${Date.now()}`;
        const rawRes = await fetch(rawUrl, {
          headers: config.token ? { 'Authorization': `token ${config.token}` } : {}
        });
        if (rawRes.ok) {
          return await rawRes.json();
        }
      } catch (err) {
        console.warn('No se pudo obtener el catálogo remoto por raw.githubusercontent.com:', err);
      }
    }

    return null;
  }
}

// Exponer en el contexto global
window.GitHubSync = GitHubSync;
