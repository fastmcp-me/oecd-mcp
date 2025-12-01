/**
 * Supabase Cache Client for OECD MCP Server
 * Implements 3-tier caching: Memory → Supabase DB → Supabase Storage
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface CacheOptions {
  ttl?: number; // Time-to-live in milliseconds
  useStorage?: boolean; // Force storage for large datasets
}

export interface CachedData {
  data: any;
  cachedAt: Date;
}

export interface CacheStatistics {
  totalCached: number;
  hitRate: number;
  popularDataflows: Array<{ dataflow_id: string; hits: number }>;
}

/**
 * Multi-tier cache implementation
 * Level 1: In-memory Map (1 min TTL, instant access)
 * Level 2: Supabase database (24h-7d TTL, ~50ms access)
 * Level 3: Supabase Storage (for large datasets >1000 obs, ~100ms access)
 */
export class SupabaseCache {
  private supabase: SupabaseClient;
  private memoryCache: Map<string, CachedData>;
  private readonly STORAGE_BUCKET = 'oecd-dataflow-data';
  private readonly LARGE_DATASET_THRESHOLD = 10000; // Only warn for very large datasets

  constructor(supabaseUrl: string, supabaseKey: string) {
    this.supabase = createClient(supabaseUrl, supabaseKey);
    this.memoryCache = new Map();

    // Clean up memory cache every minute
    setInterval(() => this.cleanMemoryCache(), 60_000);
  }

  /**
   * Generate cache key from query parameters
   */
  generateCacheKey(params: {
    dataflowId: string;
    filter?: string;
    startPeriod?: string;
    endPeriod?: string;
    lastNObservations?: number;
  }): string {
    return [
      params.dataflowId,
      params.filter || 'all',
      params.startPeriod || '',
      params.endPeriod || '',
      params.lastNObservations || '',
    ].join(':');
  }

  /**
   * Get cached observations with 3-tier fallback
   */
  async getCachedObservations(cacheKey: string): Promise<any | null> {
    // Level 1: Memory cache (instant, 1 min TTL)
    const memCached = this.memoryCache.get(cacheKey);
    if (memCached && this.isValid(memCached.cachedAt, 60_000)) {
      await this.recordHit(cacheKey, 'memory', Date.now());
      return memCached.data;
    }

    // Level 2: Supabase database (~50ms)
    const startTime = Date.now();
    const { data, error } = await this.supabase
      .from('oecd_cached_observations')
      .select('*')
      .eq('cache_key', cacheKey)
      .single();

    if (error || !data) {
      await this.recordHit(cacheKey, 'api-miss', Date.now() - startTime);
      return null;
    }

    // Check if data is still valid based on TTL
    const ttl = this.calculateTTL(data.start_period);
    if (!this.isValid(data.cached_at, ttl)) {
      await this.recordHit(cacheKey, 'api-miss', Date.now() - startTime);
      return null;
    }

    // Data found in database - update memory cache
    this.memoryCache.set(cacheKey, {
      data: data.data,
      cachedAt: new Date(data.cached_at),
    });
    await this.recordHit(cacheKey, 'supabase-db', Date.now() - startTime);
    await this.updateAccessStats(cacheKey);
    return data.data;
  }

  /**
   * Store observations in cache (database or storage based on size)
   */
  async storeCachedObservations(
    cacheKey: string,
    observations: any[],
    metadata: {
      dataflowId: string;
      filter?: string;
      startPeriod?: string;
      endPeriod?: string;
      lastNObservations?: number;
    }
  ): Promise<void> {
    const observationCount = observations.length;

    // Warn if dataset is very large (>10k observations)
    if (observationCount > this.LARGE_DATASET_THRESHOLD) {
      console.warn(
        `⚠️  Large dataset cached: ${observationCount} observations for ${metadata.dataflowId}`
      );
    }

    // Store ALL datasets directly in database (Postgres JSONB handles large data efficiently)
    await this.supabase.from('oecd_cached_observations').upsert(
      {
        cache_key: cacheKey,
        dataflow_id: metadata.dataflowId,
        filter: metadata.filter,
        start_period: metadata.startPeriod,
        end_period: metadata.endPeriod,
        last_n_observations: metadata.lastNObservations,
        observation_count: observationCount,
        data: observations,
        storage_url: null, // Not using Storage bucket
        cached_at: new Date().toISOString(),
        accessed_at: new Date().toISOString(),
        access_count: 1,
      },
      { onConflict: 'cache_key' }
    );

    // Update memory cache
    this.memoryCache.set(cacheKey, {
      data: observations,
      cachedAt: new Date(),
    });
  }

  /**
   * Calculate TTL based on data recency
   * Recent data (last 3 months): 24 hours
   * Historical data (older): 7 days
   */
  private calculateTTL(startPeriod?: string): number {
    if (!startPeriod) return 24 * 60 * 60 * 1000; // 24 hours default

    try {
      const period = new Date(startPeriod);
      const threeMonthsAgo = new Date();
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

      // Recent data: 24 hours, Historical data: 7 days
      return period > threeMonthsAgo
        ? 24 * 60 * 60 * 1000
        : 7 * 24 * 60 * 60 * 1000;
    } catch {
      return 24 * 60 * 60 * 1000; // Default to 24 hours if parsing fails
    }
  }

  /**
   * Check if cached data is still valid
   */
  private isValid(cachedAt: Date, ttl: number): boolean {
    return Date.now() - new Date(cachedAt).getTime() < ttl;
  }

  /**
   * Upload data to Supabase Storage bucket
   */
  private async uploadToStorage(path: string, data: any): Promise<string> {
    const { data: uploadData, error } = await this.supabase.storage
      .from(this.STORAGE_BUCKET)
      .upload(path, JSON.stringify(data), {
        contentType: 'application/json',
        upsert: true,
      });

    if (error) {
      console.error('Storage upload error:', error);
      throw error;
    }

    // Get public URL
    const {
      data: { publicUrl },
    } = this.supabase.storage.from(this.STORAGE_BUCKET).getPublicUrl(path);

    return publicUrl;
  }

  /**
   * Download data from Supabase Storage bucket
   */
  private async downloadFromStorage(url: string): Promise<any> {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch from storage: ${response.statusText}`);
      }
      return await response.json();
    } catch (error) {
      console.error('Storage download error:', error);
      throw error;
    }
  }

  /**
   * Update access statistics for a cache entry
   */
  private async updateAccessStats(cacheKey: string): Promise<void> {
    await this.supabase
      .from('oecd_cached_observations')
      .update({
        accessed_at: new Date().toISOString(),
        access_count: this.supabase.rpc('increment', { row_id: cacheKey }),
      })
      .eq('cache_key', cacheKey);
  }

  /**
   * Record cache hit/miss for analytics
   */
  private async recordHit(
    cacheKey: string,
    hitType: 'memory' | 'supabase-db' | 'supabase-storage' | 'api-miss',
    responseTimeMs: number
  ): Promise<void> {
    const dataflowId = cacheKey.split(':')[0]; // Extract from cache key

    await this.supabase.from('oecd_cache_stats').insert({
      cache_key: cacheKey,
      dataflow_id: dataflowId,
      hit_type: hitType,
      response_time_ms: Math.round(responseTimeMs),
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Clean up expired entries from memory cache
   */
  private cleanMemoryCache(): void {
    const now = Date.now();
    const TTL = 60_000; // 1 minute

    for (const [key, value] of this.memoryCache.entries()) {
      if (now - value.cachedAt.getTime() > TTL) {
        this.memoryCache.delete(key);
      }
    }
  }

  /**
   * Get cache performance statistics
   */
  async getCacheStatistics(): Promise<CacheStatistics> {
    // Call the utility function created in migration
    const { data, error } = await this.supabase.rpc('oecd_get_cache_summary', {
      hours: 24,
    });

    if (error || !data || data.length === 0) {
      return {
        totalCached: 0,
        hitRate: 0,
        popularDataflows: [],
      };
    }

    const stats = data[0];
    return {
      totalCached: stats.total_cached_queries || 0,
      hitRate: stats.hit_rate || 0,
      popularDataflows: stats.most_popular_dataflows || [],
    };
  }

  /**
   * Invalidate cache entry
   */
  async invalidateCache(cacheKey: string): Promise<void> {
    // Remove from memory
    this.memoryCache.delete(cacheKey);

    // Remove from database
    await this.supabase
      .from('oecd_cached_observations')
      .delete()
      .eq('cache_key', cacheKey);
  }

  /**
   * Invalidate all cache entries for a dataflow
   */
  async invalidateDataflow(dataflowId: string): Promise<void> {
    // Remove from memory (all keys starting with dataflowId)
    for (const key of this.memoryCache.keys()) {
      if (key.startsWith(dataflowId + ':')) {
        this.memoryCache.delete(key);
      }
    }

    // Remove from database
    await this.supabase
      .from('oecd_cached_observations')
      .delete()
      .eq('dataflow_id', dataflowId);
  }

  /**
   * Pre-cache popular dataflows (run on startup or cron)
   */
  async preCachePopularDataflows(
    dataflowIds: string[],
    queryFn: (dataflowId: string) => Promise<any[]>
  ): Promise<void> {
    console.log(`Pre-caching ${dataflowIds.length} popular dataflows...`);

    for (const dataflowId of dataflowIds) {
      try {
        const cacheKey = this.generateCacheKey({
          dataflowId,
          lastNObservations: 100,
        });

        // Check if already cached
        const existing = await this.getCachedObservations(cacheKey);
        if (existing) {
          console.log(`✓ ${dataflowId} already cached`);
          continue;
        }

        // Fetch and cache
        const data = await queryFn(dataflowId);
        await this.storeCachedObservations(cacheKey, data, {
          dataflowId,
          lastNObservations: 100,
        });

        console.log(`✓ Cached ${dataflowId} (${data.length} observations)`);

        // Rate limiting - avoid hammering OECD API
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (error) {
        console.error(`✗ Failed to pre-cache ${dataflowId}:`, error);
      }
    }

    console.log('Pre-caching complete!');
  }
}
