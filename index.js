module.exports = {
  CacheCluster: require('./lib/CacheCluster'),
  CacheInstance: require('./lib/CacheInstance'),
  ConnectionPool: require('./lib/ConnectionPool'),
  ConnectionWrapper: require('./lib/ConnectionWrapper'),
  MemcacheConnection: require('./lib/MemcacheConnection'),
  InMemoryCache: require('./lib/InMemoryCache'),
  RedisConnection: require('./lib/RedisConnection'),
  RedundantCacheGroup: require('./lib/RedundantCacheGroup')
}
