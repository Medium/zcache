var poolModule = require('generic-pool')
var util = require('util')
var Q = require('kew')

var CacheInstance = require('./CacheInstance')

function CacheCluster() {
  CacheInstance.call(this)

}
util.inherits(CacheCluster, CacheInstance)

CacheCluster.prototype.isAvailable = function () {
  throw new Error("isAvailable() must be implemented by any class extending CacheInstance")
}

CacheCluster.prototype.connect = function () {
  throw new Error("connect() must be implemented by any class extending CacheInstance")
}

CacheCluster.prototype.disconnect = function () {
  throw new Error("disconnect() must be implemented by any class extending CacheInstance")
}

CacheCluster.prototype.destroy = function () {
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