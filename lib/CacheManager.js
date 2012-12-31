function CacheManager() {
  this._clusters = {}
  this._priorities = {}
}

CacheManager.prototype.addCluster = function (name, cluster, priority) {
  this._clusters[name] = cluster
  this._priorities[name] = priority
}

module.exports = CacheManager