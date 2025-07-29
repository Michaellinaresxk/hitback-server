class CacheService {
  constructor() {
    this.cache = new Map();
    this.defaultTTL = 3600000; // 1 hora en milisegundos
    this.maxSize = 1000; // Máximo de entradas en caché
  }

  // 🔑 Generar clave de caché
  generateKey(prefix, ...args) {
    return `${prefix}:${args.join(':')}`;
  }

  // 💾 Guardar en caché
  set(key, value, ttl = this.defaultTTL) {
    // Limpiar caché si está lleno
    if (this.cache.size >= this.maxSize) {
      this.cleanup();
    }

    const expiresAt = Date.now() + ttl;

    this.cache.set(key, {
      value,
      expiresAt,
      createdAt: Date.now()
    });

    console.log(`📦 Cached: ${key} (expires in ${Math.round(ttl / 1000)}s)`);
  }

  // 🔍 Obtener del caché
  get(key) {
    const cached = this.cache.get(key);

    if (!cached) {
      return null;
    }

    // Verificar si expiró
    if (Date.now() > cached.expiresAt) {
      this.cache.delete(key);
      console.log(`⏰ Cache expired: ${key}`);
      return null;
    }

    console.log(`✅ Cache hit: ${key}`);
    return cached.value;
  }

  // 🗑️ Eliminar entrada específica
  delete(key) {
    const deleted = this.cache.delete(key);
    if (deleted) {
      console.log(`🗑️ Cache deleted: ${key}`);
    }
    return deleted;
  }

  // 🧹 Limpiar entradas expiradas
  cleanup() {
    const now = Date.now();
    let deleted = 0;

    for (const [key, cached] of this.cache.entries()) {
      if (now > cached.expiresAt) {
        this.cache.delete(key);
        deleted++;
      }
    }

    console.log(`🧹 Cache cleanup: ${deleted} expired entries removed`);

    // Si aún está lleno, eliminar las entradas más antiguas
    if (this.cache.size >= this.maxSize) {
      const entries = Array.from(this.cache.entries())
        .sort((a, b) => a[1].createdAt - b[1].createdAt);

      const toDelete = entries.slice(0, Math.floor(this.maxSize * 0.2)); // Eliminar 20%

      toDelete.forEach(([key]) => {
        this.cache.delete(key);
      });

      console.log(`🗑️ Cache size limit: ${toDelete.length} oldest entries removed`);
    }
  }

  // 📊 Estadísticas del caché
  getStats() {
    const now = Date.now();
    let expired = 0;
    let active = 0;

    for (const cached of this.cache.values()) {
      if (now > cached.expiresAt) {
        expired++;
      } else {
        active++;
      }
    }

    return {
      total: this.cache.size,
      active,
      expired,
      maxSize: this.maxSize,
      utilization: Math.round((this.cache.size / this.maxSize) * 100)
    };
  }

  // 🔄 Wrapper para caché con función
  async getOrSet(key, asyncFunction, ttl = this.defaultTTL) {
    // Intentar obtener del caché primero
    const cached = this.get(key);
    if (cached !== null) {
      return cached;
    }

    try {
      // Si no está en caché, ejecutar función
      console.log(`🔄 Cache miss: ${key} - executing function`);
      const result = await asyncFunction();

      // Guardar resultado en caché
      this.set(key, result, ttl);

      return result;
    } catch (error) {
      console.error(`❌ Cache getOrSet failed for ${key}:`, error.message);
      throw error;
    }
  }

  // 🧪 Método para testing
  clear() {
    const size = this.cache.size;
    this.cache.clear();
    console.log(`🧪 Cache cleared: ${size} entries removed`);
  }

  // 🔍 Buscar por patrón de clave
  getByPattern(pattern) {
    const results = [];
    const regex = new RegExp(pattern);

    for (const [key, cached] of this.cache.entries()) {
      if (regex.test(key) && Date.now() <= cached.expiresAt) {
        results.push({ key, value: cached.value });
      }
    }

    return results;
  }

  // ⚡ Precarga de datos críticos
  async preload(preloadFunctions) {
    console.log('⚡ Starting cache preload...');

    const promises = preloadFunctions.map(async ({ key, fn, ttl }) => {
      try {
        const result = await fn();
        this.set(key, result, ttl);
        return { key, success: true };
      } catch (error) {
        console.error(`❌ Preload failed for ${key}:`, error.message);
        return { key, success: false, error: error.message };
      }
    });

    const results = await Promise.allSettled(promises);
    const successful = results.filter(r => r.status === 'fulfilled' && r.value.success).length;

    console.log(`✅ Cache preload completed: ${successful}/${preloadFunctions.length} successful`);
    return results;
  }
}

// Singleton instance
const cacheService = new CacheService();

module.exports = cacheService;