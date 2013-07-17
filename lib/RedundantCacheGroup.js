var util = require('util')
var Q = require('kew')

var CacheInstance = require('./CacheInstance')

function RedundantCacheGroup() {
  CacheInstance.call(this)

  this._cacheInstances = []
  this._connected = false
}
util.inherits(RedundantCacheGroup, CacheInstance)

function sortInstances(a, b) {
  return b.priority - a.priority
}

RedundantCacheGroup.prototype.add = function (cacheInstance, priority) {
  this._cacheInstances.push({
    instance: cacheInstance,
    priority: priority
  })

  this._cacheInstances.sort(sortInstances)
}

RedundantCacheGroup.prototype._getAvailableInstance = function () {
  for (var i = 0; i < this._cacheInstances.length; i++) {
    var instance = this._cacheInstances[i].instance
    if (instance.isAvailable()) {
      return instance
    }
  }
  return null
}

RedundantCacheGroup.prototype._getAllInstances = function () {
  var instances = []
  for (var i = 0; i < this._cacheInstances.length; i++) {
    var instance = this._cacheInstances[i].instance
    if (instance.isAvailable()) instances.push(instance)
  }
  return instances
}

RedundantCacheGroup.prototype.isAvailable = function () {
  return !!this._getAvailableInstance()
}

RedundantCacheGroup.prototype.connect = function () {
  for (var i = 0; i < this._cacheInstances.length; i++) {
    var instance = this._cacheInstances[i].instance
    if (!instance.isAvailable()) instance.connect()
  }
  this.emit('connect')
}

RedundantCacheGroup.prototype.disconnect = function () {
  for (var i = 0; i < this._cacheInstances.length; i++) {
    this._cacheInstances[i].instance.disconnect()
  }
  this.emit('disconnect')
}

RedundantCacheGroup.prototype.destroy = function () {
  for (var i = 0; i < this._cacheInstances.length; i++) {
    this._cacheInstances[i].instance.destroy()
  }
  this._cacheInstances = []
  this.emit('destroy')
}

RedundantCacheGroup.prototype.mget = function (keys) {
  var instance = this._getAvailableInstance()
  if (!instance) return Q.resolve([])

  return instance.mget(keys)
}

RedundantCacheGroup.prototype.get = function (key) {
  var instance = this._getAvailableInstance()
  if (!instance) return Q.resolve(undefined)

  return instance.get(key)
}

RedundantCacheGroup.prototype.mset = function (items, maxAgeMs) {
  var instance = this._getAvailableInstance()
  if (!instance) return Q.resolve(undefined)

  return instance.mset(items, maxAgeMs)
}

RedundantCacheGroup.prototype.set = function (key, val, maxAgeMs) {
  var instances = this._getAllInstances()
  var promises = []
  for (var i = 0; i < instances.length; i++) {
    promises.push(instances[i].set(key, val, maxAgeMs))
  }

  return Q.all(promises)
    .then(returnTrue)
}

RedundantCacheGroup.prototype.del = function (key) {
  var instances = this._getAllInstances()
  var promises = []

  for (var i = 0; i < instances.length; i++) {
    promises.push(instances[i].del(key))
  }

  return Q.all(promises)
    .then(returnTrue)
}

/**
 * Always return true
 * @return {boolean} true!
 */
function returnTrue() {
  return true
}

module.exports = RedundantCacheGroup