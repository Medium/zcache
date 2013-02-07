var events = require('events')
var util = require('util')

function CacheInstance() {}
util.inherits(CacheInstance, events.EventEmitter)

CacheInstance.prototype.connect = function () {
  throw new Error("connect() must be implemented by any class extending CacheInstance")
}

CacheInstance.prototype.destroy = function () {
  throw new Error("destroy() must be implemented by any class extending CacheInstance")
}

CacheInstance.prototype.mget = function (keys) {
  throw new Error("mget() must be implemented by any class extending CacheInstance")
}

CacheInstance.prototype.get = function (key, val) {
  throw new Error("get() must be implemented by any class extending CacheInstance")
}

CacheInstance.prototype.set = function (key, val, maxAgeMs) {
  throw new Error("set() must be implemented by any class extending CacheInstance")
}

CacheInstance.prototype.del = function (key) {
  throw new Error("del() must be implemented by any class extending CacheInstance")
}

module.exports = CacheInstance