module.exports = {
  CacheCluster: require('./lib/CacheCluster'),
  CacheInstance: require('./lib/CacheInstance'),
  ConnectionPool: require('./lib/ConnectionPool'),
  ConnectionWrapper: require('./lib/ConnectionWrapper'),
  MemcacheConnection: require('./lib/MemcacheConnection'),
  MultiplexingCache: require('./lib/MultiplexingCache'),
  InMemoryCache: require('./lib/InMemoryCache'),
  RedisConnection: require('./lib/RedisConnection'),
  FakeCache: require('./lib/FakeCache'),
  RedundantCacheGroup: require('./lib/RedundantCacheGroup'),
  TimeoutError: require('./lib/TimeoutError'),
  PartialResultError: require('./lib/PartialResultError'),
  CachePair: require('./lib/CachePair')
}
