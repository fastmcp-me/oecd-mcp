#!/usr/bin/env node
/**
 * Test Supabase Cache Integration
 * Tests cache performance: cold vs warm cache
 */

import { OECDClient } from './dist/oecd-client.js';
import 'dotenv/config';

async function testSupabaseCache() {
  console.log('🧪 Testing Supabase Cache Integration\n');
  console.log('='.repeat(80));

  // Test WITHOUT cache
  console.log('\n📊 Test 1: WITHOUT Supabase Cache (Cold)');
  const clientNoCache = new OECDClient({ enableCache: false });
  const start1 = Date.now();
  const data1 = await clientNoCache.queryData({
    dataflowId: 'QNA',
    lastNObservations: 10
  });
  const time1 = Date.now() - start1;
  console.log(`✅ Returned ${data1.length} observations in ${time1}ms (NO CACHE)`);

  // Test WITH cache - first request (cache miss)
  console.log('\n📊 Test 2: WITH Supabase Cache (Cold - Cache Miss)');
  const clientWithCache = new OECDClient({
    enableCache: true,
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseKey: process.env.SUPABASE_KEY
  });
  const start2 = Date.now();
  const data2 = await clientWithCache.queryData({
    dataflowId: 'QNA',
    lastNObservations: 10
  });
  const time2 = Date.now() - start2;
  console.log(`✅ Returned ${data2.length} observations in ${time2}ms (CACHE MISS - stored in cache)`);

  // Test WITH cache - second request (cache hit)
  console.log('\n📊 Test 3: WITH Supabase Cache (Warm - Cache Hit)');
  const start3 = Date.now();
  const data3 = await clientWithCache.queryData({
    dataflowId: 'QNA',
    lastNObservations: 10
  });
  const time3 = Date.now() - start3;
  console.log(`✅ Returned ${data3.length} observations in ${time3}ms (CACHE HIT)`);

  // Calculate speedup
  const speedup = Math.round(time1 / time3);
  console.log(`\n📈 Cache Speedup: ${speedup}x faster (${time1}ms → ${time3}ms)`);

  // Get cache stats
  if (clientWithCache.cache) {
    console.log('\n📊 Cache Statistics:');
    const stats = await clientWithCache.cache.getCacheStatistics();
    console.log(`   Total Cached Queries: ${stats.totalCached}`);
    console.log(`   Hit Rate: ${stats.hitRate}%`);
    console.log(`   Popular Dataflows:`, stats.popularDataflows.slice(0, 5));
  }

  console.log('\n' + '='.repeat(80));
  console.log('✅ Supabase Cache Integration Test Complete!\n');
}

testSupabaseCache().catch(console.error);
