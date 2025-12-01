-- OECD MCP Cache Tables Migration
-- Version: 1.0
-- Purpose: Create caching infrastructure for OECD SDMX data

-- =============================================================================
-- 1. CACHED DATAFLOWS - Metadata cache
-- =============================================================================
CREATE TABLE IF NOT EXISTS oecd_cached_dataflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dataflow_id TEXT NOT NULL UNIQUE,
  agency TEXT NOT NULL,
  version TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  structure JSONB, -- Full DSD structure
  dimensions JSONB, -- Simplified dimension info for quick lookups
  cached_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  accessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  access_count INTEGER DEFAULT 0,

  CONSTRAINT valid_dataflow_id CHECK (dataflow_id <> ''),
  CONSTRAINT valid_agency CHECK (agency <> '')
);

-- Indexes for fast lookups
CREATE INDEX idx_oecd_dataflows_id ON oecd_cached_dataflows(dataflow_id);
CREATE INDEX idx_oecd_dataflows_accessed ON oecd_cached_dataflows(accessed_at DESC);
CREATE INDEX idx_oecd_dataflows_access_count ON oecd_cached_dataflows(access_count DESC);

-- =============================================================================
-- 2. CACHED OBSERVATIONS - Query result cache
-- =============================================================================
CREATE TABLE IF NOT EXISTS oecd_cached_observations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key TEXT NOT NULL UNIQUE,
  dataflow_id TEXT NOT NULL,
  filter TEXT,
  start_period TEXT,
  end_period TEXT,
  last_n_observations INTEGER,
  observation_count INTEGER NOT NULL,
  data JSONB, -- Observations data (null if stored in Storage bucket)
  storage_url TEXT, -- URL to Storage bucket for large datasets
  cached_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  accessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  access_count INTEGER DEFAULT 0,

  CONSTRAINT valid_cache_key CHECK (cache_key <> ''),
  CONSTRAINT valid_observation_count CHECK (observation_count >= 0),
  CONSTRAINT data_or_storage CHECK (
    (data IS NOT NULL AND storage_url IS NULL) OR
    (data IS NULL AND storage_url IS NOT NULL)
  )
);

-- Indexes for query performance
CREATE INDEX idx_oecd_observations_cache_key ON oecd_cached_observations(cache_key);
CREATE INDEX idx_oecd_observations_dataflow ON oecd_cached_observations(dataflow_id);
CREATE INDEX idx_oecd_observations_accessed ON oecd_cached_observations(accessed_at DESC);
CREATE INDEX idx_oecd_observations_count ON oecd_cached_observations(observation_count);
CREATE INDEX idx_oecd_observations_access_count ON oecd_cached_observations(access_count DESC);

-- =============================================================================
-- 3. CACHE STATS - Analytics and monitoring
-- =============================================================================
CREATE TABLE IF NOT EXISTS oecd_cache_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cache_key TEXT NOT NULL,
  dataflow_id TEXT NOT NULL,
  hit_type TEXT NOT NULL, -- 'memory', 'supabase-db', 'supabase-storage', 'api-miss'
  response_time_ms INTEGER,
  observation_count INTEGER,

  CONSTRAINT valid_hit_type CHECK (
    hit_type IN ('memory', 'supabase-db', 'supabase-storage', 'api-miss')
  )
);

-- Indexes for analytics queries
CREATE INDEX idx_oecd_stats_timestamp ON oecd_cache_stats(timestamp DESC);
CREATE INDEX idx_oecd_stats_dataflow ON oecd_cache_stats(dataflow_id);
CREATE INDEX idx_oecd_stats_hit_type ON oecd_cache_stats(hit_type);
CREATE INDEX idx_oecd_stats_composite ON oecd_cache_stats(dataflow_id, timestamp DESC);

-- =============================================================================
-- 4. ROW LEVEL SECURITY (RLS) POLICIES
-- =============================================================================

-- Enable RLS on all tables
ALTER TABLE oecd_cached_dataflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE oecd_cached_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE oecd_cache_stats ENABLE ROW LEVEL SECURITY;

-- Public read access for cached dataflows
CREATE POLICY "Public read oecd_cached_dataflows"
ON oecd_cached_dataflows FOR SELECT
USING (true);

-- Public read access for cached observations
CREATE POLICY "Public read oecd_cached_observations"
ON oecd_cached_observations FOR SELECT
USING (true);

-- Public read access for cache stats (for transparency)
CREATE POLICY "Public read oecd_cache_stats"
ON oecd_cache_stats FOR SELECT
USING (true);

-- Service role write access for dataflows (MCP server only)
CREATE POLICY "Service write oecd_cached_dataflows"
ON oecd_cached_dataflows FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Service role write access for observations (MCP server only)
CREATE POLICY "Service write oecd_cached_observations"
ON oecd_cached_observations FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Service role write access for stats (MCP server only)
CREATE POLICY "Service write oecd_cache_stats"
ON oecd_cache_stats FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- =============================================================================
-- 5. UTILITY FUNCTIONS
-- =============================================================================

-- Function to clean old cache stats (keep last 30 days)
CREATE OR REPLACE FUNCTION oecd_cleanup_old_stats()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM oecd_cache_stats
  WHERE timestamp < NOW() - INTERVAL '30 days';

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get cache statistics summary
CREATE OR REPLACE FUNCTION oecd_get_cache_summary(hours INTEGER DEFAULT 24)
RETURNS TABLE (
  total_cached_queries INTEGER,
  total_hits INTEGER,
  total_misses INTEGER,
  hit_rate NUMERIC,
  avg_response_time_ms NUMERIC,
  most_popular_dataflows JSONB
) AS $$
BEGIN
  RETURN QUERY
  WITH stats_window AS (
    SELECT *
    FROM oecd_cache_stats
    WHERE timestamp >= NOW() - (hours || ' hours')::INTERVAL
  ),
  hit_stats AS (
    SELECT
      COUNT(*) FILTER (WHERE hit_type != 'api-miss') AS hits,
      COUNT(*) FILTER (WHERE hit_type = 'api-miss') AS misses,
      AVG(response_time_ms) AS avg_time
    FROM stats_window
  ),
  popular_dataflows AS (
    SELECT
      jsonb_agg(
        jsonb_build_object(
          'dataflow_id', dataflow_id,
          'count', cnt
        ) ORDER BY cnt DESC
      ) AS popular
    FROM (
      SELECT dataflow_id, COUNT(*) as cnt
      FROM stats_window
      GROUP BY dataflow_id
      ORDER BY cnt DESC
      LIMIT 10
    ) top_10
  )
  SELECT
    (SELECT COUNT(DISTINCT cache_key) FROM oecd_cached_observations)::INTEGER,
    hs.hits::INTEGER,
    hs.misses::INTEGER,
    CASE
      WHEN (hs.hits + hs.misses) > 0
      THEN ROUND((hs.hits::NUMERIC / (hs.hits + hs.misses)) * 100, 2)
      ELSE 0
    END,
    ROUND(hs.avg_time, 2),
    pd.popular
  FROM hit_stats hs
  CROSS JOIN popular_dataflows pd;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- 6. COMMENTS FOR DOCUMENTATION
-- =============================================================================

COMMENT ON TABLE oecd_cached_dataflows IS 'Metadata cache for OECD dataflows (structures, dimensions)';
COMMENT ON TABLE oecd_cached_observations IS 'Query result cache for OECD observations data';
COMMENT ON TABLE oecd_cache_stats IS 'Analytics tracking for cache performance monitoring';

COMMENT ON FUNCTION oecd_cleanup_old_stats() IS 'Removes cache stats older than 30 days (run daily via cron)';
COMMENT ON FUNCTION oecd_get_cache_summary(INTEGER) IS 'Returns cache performance summary for the last N hours';

-- =============================================================================
-- 7. INITIAL DATA (Optional - Pre-seed popular dataflows)
-- =============================================================================

-- Insert commonly used dataflows for immediate caching
-- This will be populated by the MCP server on first run
-- INSERT INTO oecd_cached_dataflows (dataflow_id, agency, version, name, description) VALUES
-- ('QNA', 'OECD.SDD.NAD', '1.0', 'Quarterly National Accounts', 'GDP and main aggregates'),
-- ... etc

-- =============================================================================
-- MIGRATION COMPLETE
-- =============================================================================

-- Verification queries
DO $$
BEGIN
  RAISE NOTICE 'Migration complete! Created:';
  RAISE NOTICE '  - oecd_cached_dataflows table';
  RAISE NOTICE '  - oecd_cached_observations table';
  RAISE NOTICE '  - oecd_cache_stats table';
  RAISE NOTICE '  - RLS policies (public read, service write)';
  RAISE NOTICE '  - Utility functions for analytics';
  RAISE NOTICE '';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '  1. Create Storage bucket: oecd-dataflow-data';
  RAISE NOTICE '  2. Set bucket to public read access';
  RAISE NOTICE '  3. Configure MCP server with Supabase credentials';
END $$;
