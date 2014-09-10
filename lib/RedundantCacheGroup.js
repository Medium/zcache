var util = require('util')
var Q = require('kew')

var CacheInstance = require('./CacheInstance')
var cacheUtils = require('./CacheUtils')

/**
 * @constructor
 * @extends {CacheInstance}
 */
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
  if (instanceIndex !== undefined) return this._cacheInstances[instanceIndex].instance

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
  return !!this._getAvailableInstance(0)
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

/** @override */
RedundantCacheGroup.prototype.mget = function (keys, opt_args) {
  if (!opt_args) {
    opt_args = { start: 0 }
  } else if (!('start' in opt_args)) {
    opt_args.start = 0
  }

  var instanceIndex = this._getIndexOfFirstAvailableInstance(opt_args.start)
  var self = this

  if (instanceIndex == null) return Q.resolve([])

  return this._getAvailableInstance(instanceIndex).mget(keys, opt_args)
    .then(function (res) {
      var nextInstanceIndex = self._getIndexOfFirstAvailableInstance(instanceIndex + 1)
      var promises = []

      for (var i = 0; i < keys.length; i++) {
        if (!res[i] && nextInstanceIndex != null) {
          var rollUp = []
          var startOfHole = i
          while (i < keys.length && !res[i]) rollUp.push(keys[i++])

          var cloned_opts = self._cloneArgs(opt_args)
          cloned_opts.start = nextInstanceIndex
          promises.push(self.mget(rollUp, cloned_opts)
            .then(function (itemIndex, data) {
              if (data === undefined) return undefined
              for (var k = 0; k < data.length; k++) res[itemIndex + k] = data[k]
            }.bind(null, startOfHole)))
        }
      }

      return Q.all(promises).then(function () {
        return res
      })
    })
}

/**
 * @param {number=} start
 * @override
 */
RedundantCacheGroup.prototype.get = function (key, start) {
  var instanceIndex = this._getIndexOfFirstAvailableInstance(start || 0)
  var self = this

  if (instanceIndex == null) return Q.resolve(undefined)

  return this._getAvailableInstance(instanceIndex).get(key)
    .then(function (data) {
      if (data === undefined) return self.get(key, instanceIndex + 1)
      return data
    })
}

RedundantCacheGroup.prototype.mset = function (items, maxAgeMs, setWhenNotExist) {
  var instances = this._getAllInstances()
  var promises = []

  for (var i = 0; i < instances.length; i++) {
    promises.push(instances[i].mset(items, maxAgeMs, setWhenNotExist))
  }

  return Q.all(promises)
    .then(returnTrue)
}

/** @override */
RedundantCacheGroup.prototype.set = function (key, val, maxAgeMs, setWhenNotExist) {
  var instances = this._getAllInstances()
  var promises = []

  for (var i = 0; i < instances.length; i++) {
    promises.push(instances[i].set(key, val, maxAgeMs, setWhenNotExist))
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

/** @override */
RedundantCacheGroup.prototype.getUrisByKey = function (key) {
  var uris = []

  this._getAllInstances().forEach(function (instance) {
    instance.getUrisByKey(key).forEach(function (uri) {
      if (uris.indexOf(uri) < 0) uris.push(uri)
    })
  })

  return uris
}

/** @override */
RedundantCacheGroup.prototype.getPendingRequestsCount = function () {
  return cacheUtils.mergePendingRequestCounts(this._getAllInstances())
}

RedundantCacheGroup.prototype._cloneArgs = function (args) {
  if (!args) return null
  var clonedArgs = {}
  for (var field in args) {
    clonedArgs[field] = args[field]
  }
  return clonedArgs
}

/**
 * Always return true
 * @return {boolean} true!
 */
function returnTrue() {
  return true
}

module.exports = RedundantCacheGroup
