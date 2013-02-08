var poolModule = require('generic-pool')
var util = require('util')
var Q = require('kew')

var CacheInstance = require('./CacheInstance')
var ConsistentHasher = require('./ConsistentHasher')

function CacheCluster(opts) {
  CacheInstance.call(this)

  opts = opts || {}
  this._opts = {
    create: opts.create,
    nodesPerRead: opts.nodesPerRead || 3,
    nodesPerWrite: opts.nodesPerWrite || 3
  }

  this._state = {
    shouldConnect: false
  }

  this._servers = {}
  this._currentCapacities = {}
  this._targetCapacities = {}
  this._hasher = new ConsistentHasher
}
util.inherits(CacheCluster, CacheInstance)

CacheCluster.prototype.setCapacity = function (uri, capacity, opts) {
  var self = this

  if (this._servers[uri]) {
    this._hasher.setNodeCapacity(uri, capacity)
  } else {
    this._opts.create(uri, opts, function (err, cacheInstance) {
      self._servers[uri] = cacheInstance
      self._hasher.setNodeCapacity(uri, capacity)
    })
  }
}

CacheCluster.prototype.isAvailable = function () {
  for (var key in this._servers) {
    if (this._servers[key].isAvailable()) return true
  }
  return false
}

CacheCluster.prototype.connect = function () {
  this._state.shouldConnect = true
  throw new Error("connect() must be implemented by any class extending CacheInstance")
}

CacheCluster.prototype.disconnect = function () {
  this._state.shouldConnect = false
  throw new Error("disconnect() must be implemented by any class extending CacheInstance")
}

CacheCluster.prototype.destroy = function () {
  this.disconnect()
  throw new Error("destroy() must be implemented by any class extending CacheInstance")
}

CacheCluster.prototype.mget = function (keys) {
  throw new Error("mget() must be implemented by any class extending CacheInstance")
}

CacheCluster.prototype.get = function (key) {
  throw new Error("get() must be implemented by any class extending CacheInstance")
}

CacheCluster.prototype.set = function (key, val, maxAgeMs) {
  throw new Error("set() must be implemented by any class extending CacheInstance")
}

CacheCluster.prototype.del = function (key) {
  throw new Error("del() must be implemented by any class extending CacheInstance")
}

module.exports = CacheCluster