#!/usr/bin/env node
/**
 * Safe Cache Test - Tests cache with reasonable limits
 */

import { OECDClient } from './dist/oecd-client.js';
import 'dotenv/config';

async function testCacheSafely() {
  console.log('🧪 Testing Supabase Cache (Safe Limits)\n');
  console.log('='.repeat(80));

  const client = new OECDClient({
    enableCache: true,
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseKey: process.env.SUPABASE_KEY
  });

  // Test 1: Cold cache (API call)
  console.log('\n📊 Test 1: Cold Cache (API Call)');
  console.log('Query: QNA with lastNObservations=100');
  const start1 = Date.now();
  const data1 = await client.queryData({
    dataflowId: 'QNA',
    lastNObservations: 100  // Safe limit
  });
  const time1 = Date.now() - start1;
  console.log(`✅ Returned ${data1.length} observations in ${time1}ms`);
  console.log('   📝 Data stored in Supabase cache');

  // Wait briefly
  console.log('\n⏳ Waiting 2 seconds...');
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Test 2: Warm cache (Supabase retrieval)
  console.log('\n📊 Test 2: Warm Cache (Supabase Hit)');
  console.log('Query: Same QNA with lastNObservations=100');
  const start2 = Date.now();
  const data2 = await client.queryData({
    dataflowId: 'QNA',
    lastNObservations: 100
  });
  const time2 = Date.now() - start2;
  console.log(`✅ Returned ${data2.length} observations in ${time2}ms`);

  // Calculate speedup
  const speedup = Math.round(time1 / time2 * 10) / 10;
  console.log(`\n📈 Cache Performance:`);
  console.log(`   Cold (API): ${time1}ms`);
  console.log(`   Warm (Cache): ${time2}ms`);
  console.log(`   Speedup: ${speedup}x faster`);

  // Data consistency check
  const consistent = JSON.stringify(data1) === JSON.stringify(data2);
  console.log(`   Data Consistency: ${consistent ? '✅ IDENTICAL' : '❌ DIFFERENT'}`);

  // Get cache statistics
  if (client.cache) {
    console.log('\n📊 Cache Statistics:');
    try {
      const stats = await client.cache.getCacheStatistics();
      console.log(`   Total Cached Queries: ${stats.totalCached}`);
      console.log(`   Hit Rate: ${stats.hitRate}%`);
      if (stats.popularDataflows.length > 0) {
        console.log(`   Popular Dataflows:`);
        stats.popularDataflows.slice(0, 5).forEach(df => {
          console.log(`      - ${df.dataflow_id}: ${df.hits} hits`);
        });
      }
    } catch (error) {
      console.log(`   ⚠️  Could not fetch stats: ${error.message}`);
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log('✅ Safe Cache Test Complete!\n');
}

testCacheSafely().catch(console.error);
