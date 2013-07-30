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

RedundantCacheGroup.prototype._getAvailableInstance = function (start) {
  var instanceIndex = this._getIndexOfFirstAvailableInstance(start)
  if (this._cacheInstances[instanceIndex]) return this._cacheInstances[instanceIndex].instance

  return null
}

RedundantCacheGroup.prototype._getIndexOfFirstAvailableInstance = function (start) {
  for (var i = (start || 0); i < this._cacheInstances.length; i++) {
    var instance = this._cacheInstances[i].instance
    if (instance.isAvailable()) return i
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
  var instanceIndex = this._getIndexOfFirstAvailableInstance()
  if (instanceIndex == null) return Q.resolve([])

  // try the first cache
  var ret = this._getAvailableInstance(instanceIndex).mget(keys)
  var nextInstance = this._getAvailableInstance(instanceIndex + 1)

  return ret.then(function (res) {
    for (var i = 0; i < res.length; i++) {
      if (!res[i] && nextInstance) {
        var rollUp = []
        while (!res[i] && i < res.length) rollUp.push(keys[i++])

        nextInstance.mget(rollUp)
          .then(function (data) {
            for (var k = 0; k < data.length; k++) res[i] = data[k]
          })
      }
    }

    return res
  }.bind(this))
}

RedundantCacheGroup.prototype.get = function (key) {
  var instanceIndex = this._getIndexOfFirstAvailableInstance()

  for (var i = instanceIndex, instance; instance = this._getAvailableInstance(i); i++) {
    var ret = instance.get(key)
    if (ret) return ret
  }
  return Q.resolve(undefined)
}

RedundantCacheGroup.prototype.mset = function (items, maxAgeMs) {
  var instances = this._getAllInstances()
  var promises = []

  for (var i = 0; i < instances.length; i++) {
    promises.push(instances[i].mset(items, maxAgeMs))
  }

  return Q.all(promises)
    .then(returnTrue)
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
