# Supabase Integration Plan - OECD MCP Server

**Version:** 1.0
**Date:** 2025-12-01
**Status:** Planning Phase
**Purpose:** Add production-grade caching and storage for OECD MCP server to support public deployment

---

## 📋 Executive Summary

### Current State
- **30 dataflows** across 13 categories (76% coverage)
- **No caching** - every query hits OECD SDMX API directly
- **Context protection** - DEFAULT_LIMIT: 100, MAX_LIMIT: 1000 observations
- **Rate limiting** - OECD API throttles after ~8-9 rapid requests (429 errors)
- **Performance** - Average API response: 2000-4000ms

### Proposed Solution
**Multi-tier caching architecture with Supabase:**
1. **In-memory cache** (1-minute TTL) - Instant responses for repeated queries
2. **Supabase cache** (24h-7d TTL) - Fast responses for popular queries
3. **OECD API fallback** - Fresh data when cache misses

### Key Benefits
- **40x faster** responses (50ms vs 2000ms for cached data)
- **Reduced API load** - Avoid rate limiting issues
- **Offline resilience** - Serve cached data if OECD API is down
- **Analytics** - Track popular queries and usage patterns
- **Cost efficient** - ~$0 for current scale (Free tier: 500MB storage, 50GB bandwidth)

---

## 🏗️ Architecture Design

### System Diagram

```
┌─────────────────┐
│   MCP Client    │
│  (Claude.app)   │
└────────┬────────┘
         │ MCP Protocol
         ▼
┌─────────────────────────────────────────────┐
│         OECD MCP Server (Node.js)           │
│                                             │
│  ┌─────────────────────────────────────┐  │
│  │    In-Memory Cache (Map)            │  │
│  │    TTL: 1 minute                    │  │
│  │    Size: ~100 recent queries        │  │
│  └─────────┬───────────────────────────┘  │
│            │ Cache Miss                    │
│            ▼                                │
│  ┌─────────────────────────────────────┐  │
│  │    Supabase Client                  │  │
│  │    - Query cache table              │  │
│  │    - Download from Storage bucket   │  │
│  └─────────┬───────────────────────────┘  │
│            │ Cache Miss                    │
│            ▼                                │
│  ┌─────────────────────────────────────┐  │
│  │    OECD SDMX API Client             │  │
│  │    - Fetch fresh data               │  │
│  │    - Store in Supabase              │  │
│  │    - Update cache                   │  │
│  └─────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
```

### Caching Strategy

**3-Tier Cache Hierarchy:**

```typescript
async function queryWithCache(dataflowId: string, filter: string, options: QueryOptions) {
  // Level 1: In-memory cache (instant)
  const memKey = generateCacheKey(dataflowId, filter, options);
  const memCached = memoryCache.get(memKey);
  if (memCached && !isExpired(memCached, 60_000)) { // 1 min TTL
    return memCached.data;
  }

  // Level 2: Supabase cache (fast, ~50ms)
  const dbCached = await supabase
    .from('cached_observations')
    .select('data, cached_at')
    .eq('cache_key', memKey)
    .single();

  if (dbCached && !isExpired(dbCached, getTTL(dataflowId))) {
    memoryCache.set(memKey, dbCached); // Promote to L1
    return dbCached.data;
  }

  // Level 3: OECD API (slow, ~2000ms)
  const freshData = await oecdSDMX.queryData(dataflowId, filter, options);

  // Store in all cache levels
  await storeCached(memKey, freshData, { dataflowId, filter, options });
  memoryCache.set(memKey, { data: freshData, cached_at: new Date() });

  return freshData;
}
```

**TTL Strategy (Time-To-Live):**
- **Recent data** (last 3 months): 24 hours - Data changes frequently
- **Historical data** (older than 3 months): 7 days - Data is stable
- **Metadata** (dataflow structures): 30 days - Rarely changes
- **In-memory cache**: 1 minute - Prevent memory bloat

---

## 💾 Supabase Schema Design

### Database Tables

#### 1. `cached_dataflows` - Dataflow metadata cache
```sql
CREATE TABLE cached_dataflows (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dataflow_id TEXT NOT NULL UNIQUE,
  agency TEXT NOT NULL,
  version TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  structure JSONB, -- Full DSD structure
  dimensions JSONB, -- Simplified dimension info
  cached_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  accessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  access_count INTEGER DEFAULT 0,

  INDEX idx_dataflow_id (dataflow_id),
  INDEX idx_accessed_at (accessed_at DESC)
);
```

**Purpose:** Cache dataflow metadata to avoid repeated structure queries
**Size Estimate:** ~500 dataflows × 10KB = ~5 MB
**TTL:** 30 days (metadata rarely changes)

#### 2. `cached_observations` - Query result cache
```sql
CREATE TABLE cached_observations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cache_key TEXT NOT NULL UNIQUE, -- Hash of query parameters
  dataflow_id TEXT NOT NULL,
  filter TEXT,
  start_period TEXT,
  end_period TEXT,
  last_n_observations INTEGER,
  observation_count INTEGER NOT NULL,
  data JSONB NOT NULL, -- Actual observations
  storage_url TEXT, -- Optional: URL to Storage bucket for large datasets
  cached_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  accessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  access_count INTEGER DEFAULT 0,

  INDEX idx_cache_key (cache_key),
  INDEX idx_dataflow_id (dataflow_id),
  INDEX idx_accessed_at (accessed_at DESC),
  INDEX idx_observation_count (observation_count)
);
```

**Purpose:** Cache actual query results for repeated queries
**Size Estimate:**
- Typical query: 100 observations × 500 bytes = 50 KB
- 1000 cached queries = 50 MB
- Large queries offloaded to Storage

**TTL:** Dynamic based on data recency

#### 3. `cache_stats` - Analytics and monitoring
```sql
CREATE TABLE cache_stats (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cache_key TEXT NOT NULL,
  dataflow_id TEXT NOT NULL,
  hit_type TEXT NOT NULL, -- 'memory', 'supabase', 'api_miss'
  response_time_ms INTEGER,
  observation_count INTEGER,

  INDEX idx_timestamp (timestamp DESC),
  INDEX idx_dataflow_id (dataflow_id),
  INDEX idx_hit_type (hit_type)
);
```

**Purpose:** Track cache performance and popular queries
**Retention:** 30 days rolling window
**Size Estimate:** ~10K requests/day × 200 bytes × 30 days = ~60 MB

### Storage Buckets

#### `dataflow-metadata/` - Dataflow structures
```
dataflow-metadata/
├── QNA.json                  # Quarterly National Accounts structure
├── MEI.json                  # Main Economic Indicators structure
├── HEALTH_STAT.json          # Health Statistics structure
└── [dataflow_id].json        # One file per dataflow
```

**Purpose:** Store full DSD structures for dataflows
**Size:** ~500 files × 20 KB = ~10 MB
**Access:** On-demand when structure is requested

#### `dataflow-data/` - Large observation datasets
```
dataflow-data/
├── QNA/
│   ├── USA.GDP..._2020-2023.json
│   └── all_2023-Q1-Q4.json
├── SOCX_AGG/
│   └── all_historical.json    # 70K+ observations
└── [dataflow_id]/
    └── [filter]_[period].json
```

**Purpose:** Offload large datasets (>1000 observations) from database to Storage
**Strategy:**
- Store in database if <1000 observations (fast queries)
- Store in Storage if >1000 observations (avoid database bloat)
- Reference via `storage_url` in `cached_observations` table

**Size Estimate:**
- 500 dataflows × 100 KB average = 50 MB
- Large datasets (10 dataflows × 5 MB) = 50 MB
- **Total:** ~100 MB

---

## 🔧 Implementation Plan

### Phase 1: Supabase Setup (1-2 hours)
**Tasks:**
1. ✅ Create new Supabase project: `oecd-mcp-cache`
2. ✅ Run schema migrations (create tables + indexes)
3. ✅ Create Storage buckets with public read access
4. ✅ Set up Row Level Security (RLS) policies
5. ✅ Generate API keys (anon + service_role)

**RLS Policies:**
```sql
-- Public read access for cached data
CREATE POLICY "Public read cached_dataflows"
ON cached_dataflows FOR SELECT
USING (true);

CREATE POLICY "Public read cached_observations"
ON cached_observations FOR SELECT
USING (true);

-- Service role write access (MCP server only)
CREATE POLICY "Service insert cached_dataflows"
ON cached_dataflows FOR INSERT
TO service_role
WITH CHECK (true);

CREATE POLICY "Service insert cached_observations"
ON cached_observations FOR INSERT
TO service_role
WITH CHECK (true);
```

### Phase 2: Cache Client Implementation (2-3 hours)
**New File:** `src/cache/supabase-cache.ts`

```typescript
import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface CacheOptions {
  ttl?: number; // Time-to-live in milliseconds
  useStorage?: boolean; // Store large datasets in Storage bucket
}

export class SupabaseCache {
  private supabase: SupabaseClient;
  private memoryCache: Map<string, { data: any; cachedAt: Date }>;

  constructor(url: string, apiKey: string) {
    this.supabase = createClient(url, apiKey);
    this.memoryCache = new Map();
  }

  async getCachedObservations(cacheKey: string): Promise<any | null> {
    // Level 1: Memory cache
    const memCached = this.memoryCache.get(cacheKey);
    if (memCached && this.isValid(memCached.cachedAt, 60_000)) {
      await this.recordHit(cacheKey, 'memory');
      return memCached.data;
    }

    // Level 2: Supabase database
    const { data, error } = await this.supabase
      .from('cached_observations')
      .select('*')
      .eq('cache_key', cacheKey)
      .single();

    if (!error && data) {
      const ttl = this.calculateTTL(data.start_period);
      if (this.isValid(data.cached_at, ttl)) {
        // Check if data is in Storage
        if (data.storage_url) {
          const observations = await this.downloadFromStorage(data.storage_url);
          this.memoryCache.set(cacheKey, { data: observations, cachedAt: new Date(data.cached_at) });
          await this.recordHit(cacheKey, 'supabase-storage');
          return observations;
        }

        this.memoryCache.set(cacheKey, { data: data.data, cachedAt: new Date(data.cached_at) });
        await this.recordHit(cacheKey, 'supabase-db');
        return data.data;
      }
    }

    return null;
  }

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

    // Store large datasets in Storage bucket
    if (observationCount > 1000) {
      const storageUrl = await this.uploadToStorage(
        `dataflow-data/${metadata.dataflowId}/${cacheKey}.json`,
        observations
      );

      await this.supabase.from('cached_observations').upsert({
        cache_key: cacheKey,
        dataflow_id: metadata.dataflowId,
        filter: metadata.filter,
        start_period: metadata.startPeriod,
        end_period: metadata.endPeriod,
        last_n_observations: metadata.lastNObservations,
        observation_count: observationCount,
        data: null, // Don't store in DB
        storage_url: storageUrl,
        cached_at: new Date(),
        accessed_at: new Date(),
        access_count: 1,
      });
    } else {
      // Store small datasets directly in database
      await this.supabase.from('cached_observations').upsert({
        cache_key: cacheKey,
        dataflow_id: metadata.dataflowId,
        filter: metadata.filter,
        start_period: metadata.startPeriod,
        end_period: metadata.endPeriod,
        last_n_observations: metadata.lastNObservations,
        observation_count: observationCount,
        data: observations,
        storage_url: null,
        cached_at: new Date(),
        accessed_at: new Date(),
        access_count: 1,
      });
    }

    // Update memory cache
    this.memoryCache.set(cacheKey, { data: observations, cachedAt: new Date() });
  }

  private calculateTTL(startPeriod?: string): number {
    if (!startPeriod) return 24 * 60 * 60 * 1000; // 24 hours default

    const period = new Date(startPeriod);
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

    // Recent data: 24 hours, Historical data: 7 days
    return period > threeMonthsAgo
      ? 24 * 60 * 60 * 1000
      : 7 * 24 * 60 * 60 * 1000;
  }

  private isValid(cachedAt: Date, ttl: number): boolean {
    return Date.now() - new Date(cachedAt).getTime() < ttl;
  }

  private async uploadToStorage(path: string, data: any): Promise<string> {
    const { data: uploadData, error } = await this.supabase.storage
      .from('dataflow-data')
      .upload(path, JSON.stringify(data), {
        contentType: 'application/json',
        upsert: true,
      });

    if (error) throw error;

    const { data: { publicUrl } } = this.supabase.storage
      .from('dataflow-data')
      .getPublicUrl(path);

    return publicUrl;
  }

  private async downloadFromStorage(url: string): Promise<any> {
    const response = await fetch(url);
    return response.json();
  }

  private async recordHit(cacheKey: string, hitType: 'memory' | 'supabase-db' | 'supabase-storage') {
    // Update access stats
    await this.supabase.from('cached_observations')
      .update({
        accessed_at: new Date(),
        access_count: this.supabase.raw('access_count + 1')
      })
      .eq('cache_key', cacheKey);

    // Record analytics
    await this.supabase.from('cache_stats').insert({
      cache_key: cacheKey,
      dataflow_id: cacheKey.split(':')[0], // Extract from cache key
      hit_type: hitType,
      timestamp: new Date(),
    });
  }

  async getCacheStatistics(): Promise<{
    totalCached: number;
    hitRate: number;
    popularDataflows: Array<{ dataflow_id: string; hits: number }>;
  }> {
    const { data: cached } = await this.supabase
      .from('cached_observations')
      .select('id', { count: 'exact' });

    const { data: stats } = await this.supabase
      .from('cache_stats')
      .select('hit_type, dataflow_id')
      .gte('timestamp', new Date(Date.now() - 24 * 60 * 60 * 1000)); // Last 24h

    const totalHits = stats?.length || 0;
    const cacheHits = stats?.filter(s => s.hit_type !== 'api_miss').length || 0;

    const popularDataflows = Object.entries(
      stats?.reduce((acc, s) => {
        acc[s.dataflow_id] = (acc[s.dataflow_id] || 0) + 1;
        return acc;
      }, {} as Record<string, number>) || {}
    )
      .map(([dataflow_id, hits]) => ({ dataflow_id, hits }))
      .sort((a, b) => b.hits - a.hits)
      .slice(0, 10);

    return {
      totalCached: cached?.length || 0,
      hitRate: totalHits > 0 ? cacheHits / totalHits : 0,
      popularDataflows,
    };
  }
}
```

### Phase 3: Integrate with OECDClient (1 hour)
**Modify:** `src/oecd-client.ts`

```typescript
import { SupabaseCache } from './cache/supabase-cache.js';

export class OECDClient {
  private sdmxClient: OECDSDMXClient;
  private cache?: SupabaseCache;

  constructor(options?: { enableCache?: boolean }) {
    this.sdmxClient = new OECDSDMXClient();

    if (options?.enableCache && process.env.SUPABASE_URL && process.env.SUPABASE_KEY) {
      this.cache = new SupabaseCache(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_KEY
      );
    }
  }

  async queryData(params: DataQuery): Promise<any[]> {
    const cacheKey = this.generateCacheKey(params);

    // Try cache first
    if (this.cache) {
      const cached = await this.cache.getCachedObservations(cacheKey);
      if (cached) return cached;
    }

    // Cache miss - fetch from API
    const data = await this.sdmxClient.queryData(
      params.dataflowId,
      params.filter || 'all',
      {
        startPeriod: params.startPeriod,
        endPeriod: params.endPeriod,
        lastNObservations: params.lastNObservations,
      }
    );

    // Store in cache
    if (this.cache) {
      await this.cache.storeCachedObservations(cacheKey, data, {
        dataflowId: params.dataflowId,
        filter: params.filter,
        startPeriod: params.startPeriod,
        endPeriod: params.endPeriod,
        lastNObservations: params.lastNObservations,
      });
    }

    return data;
  }

  private generateCacheKey(params: DataQuery): string {
    return [
      params.dataflowId,
      params.filter || 'all',
      params.startPeriod || '',
      params.endPeriod || '',
      params.lastNObservations || '',
    ].join(':');
  }
}
```

### Phase 4: Environment Configuration (15 min)
**Add to `.env`:**
```bash
# Supabase Configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Cache Settings
ENABLE_CACHE=true
CACHE_DEFAULT_TTL=86400000  # 24 hours in ms
```

**Update `package.json` dependencies:**
```json
{
  "dependencies": {
    "@supabase/supabase-js": "^2.39.0",
    // ... existing dependencies
  }
}
```

### Phase 5: Testing & Validation (1-2 hours)
**Test File:** `test-supabase-cache.ts`

```typescript
import { OECDClient } from './src/oecd-client.js';

async function testCache() {
  console.log('🧪 Testing Supabase Cache Integration\n');

  const client = new OECDClient({ enableCache: true });

  // Test 1: Cold cache (API fetch)
  console.log('Test 1: Cold cache - Fetching from API...');
  const start1 = Date.now();
  const data1 = await client.queryData({ dataflowId: 'QNA', lastNObservations: 100 });
  const time1 = Date.now() - start1;
  console.log(`✅ Fetched ${data1.length} observations in ${time1}ms (API)\n`);

  // Test 2: Warm cache (Supabase)
  console.log('Test 2: Warm cache - Fetching from Supabase...');
  const start2 = Date.now();
  const data2 = await client.queryData({ dataflowId: 'QNA', lastNObservations: 100 });
  const time2 = Date.now() - start2;
  console.log(`✅ Fetched ${data2.length} observations in ${time2}ms (Cache)`);
  console.log(`🚀 Speedup: ${Math.round(time1 / time2)}x faster!\n`);

  // Test 3: Large dataset (Storage bucket)
  console.log('Test 3: Large dataset - Testing Storage offload...');
  const start3 = Date.now();
  const data3 = await client.queryData({ dataflowId: 'SOCX_AGG', lastNObservations: 1000 });
  const time3 = Date.now() - start3;
  console.log(`✅ Fetched ${data3.length} observations in ${time3}ms\n`);

  // Test 4: Cache statistics
  console.log('Test 4: Cache statistics...');
  const stats = await client.cache?.getCacheStatistics();
  console.log('📊 Cache Stats:');
  console.log(`   Total cached queries: ${stats?.totalCached}`);
  console.log(`   Hit rate: ${(stats?.hitRate * 100).toFixed(1)}%`);
  console.log(`   Popular dataflows: ${stats?.popularDataflows.map(d => d.dataflow_id).join(', ')}`);
}

testCache().catch(console.error);
```

### Phase 6: Deployment (30 min)
1. ✅ Add Supabase env vars to Render.com
2. ✅ Deploy to production
3. ✅ Monitor cache performance
4. ✅ Verify Storage bucket access

---

## 📊 Cost Analysis

### Supabase Free Tier Limits
| Resource | Free Tier | Estimated Usage | Status |
|----------|-----------|-----------------|--------|
| Database Storage | 500 MB | ~65 MB | ✅ 13% |
| Storage Buckets | 1 GB | ~100 MB | ✅ 10% |
| Database Bandwidth | 5 GB/month | ~500 MB/month | ✅ 10% |
| Storage Bandwidth | 2 GB/month | ~200 MB/month | ✅ 10% |

**Conclusion:** Well within free tier for current scale (30 dataflows, ~1000 queries/day)

**Scaling Considerations:**
- At 200-500 dataflows: Still within free tier
- At 10K queries/day: May need Pro plan ($25/month) for bandwidth
- Storage is cheap: $0.021/GB beyond 1GB

---

## 🎯 Success Metrics

### Performance Targets
- ✅ **Cache hit rate:** >70% after 1 week
- ✅ **Response time (cached):** <100ms (vs 2000ms API)
- ✅ **API rate limit errors:** <1% of requests
- ✅ **Uptime:** 99.9% (resilient to OECD API outages)

### Analytics to Track
1. Cache hit rate by dataflow
2. Most popular dataflows (prioritize these for optimization)
3. Average response times (memory vs Supabase vs API)
4. Storage bucket usage trends
5. Failed queries and reasons

---

## 🚀 Future Enhancements

### Phase 2 Features (Post-Launch)
1. **Smart pre-caching:** Background jobs to refresh popular dataflows before TTL expires
2. **Compression:** Use gzip for Storage bucket files (reduce size by ~70%)
3. **CDN integration:** CloudFront/Cloudflare for global edge caching
4. **Query optimizer:** Suggest better filters to users for faster queries
5. **Batch API:** Allow querying multiple dataflows in one request

### Admin Dashboard (Future)
- Real-time cache stats
- Manual cache invalidation
- Popular query patterns
- Cost monitoring

---

## ✅ Next Steps

1. **User approval** - Confirm this architecture aligns with requirements
2. **Create Supabase project** - Set up database and storage
3. **Implement cache layer** - Build SupabaseCache class
4. **Test thoroughly** - Verify performance improvements
5. **Deploy to production** - Add env vars and deploy
6. **Monitor & optimize** - Track metrics and tune TTLs

---

**Questions for Review:**
1. Should we pre-cache all 30 dataflows on deployment?
2. What's the priority: Speed or cost optimization?
3. Do you want a public API endpoint for cache stats?
4. Should we expose cache control to MCP clients (force refresh)?

---

**Document Status:** ✅ Ready for Review
**Estimated Implementation Time:** 6-8 hours
**Estimated Cost:** $0/month (Free tier sufficient)
