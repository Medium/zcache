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
  this._capacityIntervals = {}
  this._capacityWarmUpMs = {}
  this._currentCapacities = {}
  this._targetCapacities = {}
  this._hasher = new ConsistentHasher
}
util.inherits(CacheCluster, CacheInstance)

CacheCluster.prototype.setNodeCapacity = function (uri, capacity, opts, warmUpMs) {
  if (!capacity && !this._servers[uri]) return

  if (capacity > 0 && !this._targetCapacities[uri]) {
    var self = this
    self._currentCapacities[uri] = 0
    self._targetCapacities[uri] = 0
    self._setTargetCapacity(uri, capacity, warmUpMs)

    // add a cache instance to the cluster
    this._opts.create(uri, opts, function (err, cacheInstance) {
      if (err) return
      self._servers[uri] = cacheInstance
      self._setTargetCapacity(uri)
    })

  } else {
    // update the cache capacity for an instance
    this._setTargetCapacity(uri, capacity, warmUpMs)
  }
}

CacheCluster.prototype._resetCapacityInterval = function (uri) {
  if (this._capacityIntervals[uri]) {
    // clear any running timers
    clearInterval(this._capacityIntervals[uri])
    delete this._capacityIntervals[uri]
  }
}

CacheCluster.prototype._setTargetCapacity = function (uri, capacity, warmUpMs) {
  if (typeof capacity === 'undefined' && typeof warmUpMs === 'undefined') {
    // no args means we should use the last known value for this uri
    capacity = this._targetCapacities[uri]
    warmUpMs = this._capacityWarmUpMs[uri]
  }
  capacity = Math.floor(capacity)

  this._resetCapacityInterval(uri)

  // if the current and target capacities match the specified capacity, nothing needs to be done
  if (capacity === this._targetCapacities[uri] && capacity === this._currentCapacities[uri]) return

  // keep track of the capacities and warm up times for stopping and starting this cluster
  this._targetCapacities[uri] = capacity
  this._capacityWarmUpMs[uri] = warmUpMs

  // if the cluster isn't connected, just exist
  if (!this._state.shouldConnect) return

  if (!warmUpMs || warmUpMs < 1) {
    // warm immediately
    this._currentCapacities[uri] = capacity
    this._hasher.setNodeCapacity(uri, capacity)

  } else {
    if (!this._servers[uri]) return

    // warm with 1 capacity unit every n millis
    var self = this
    this._capacityIntervals[uri] = setInterval(function () {
      if (!self._servers[uri] || self._targetCapacities[uri] === self._currentCapacities[uri]) {
        clearInterval(self._capacityIntervals[uri])
      } else {
        self._currentCapacities[uri] += (self._currentCapacities[uri] < self._targetCapacities[uri] ? 1 : -1)
        self._hasher.setNodeCapacity(uri, self._currentCapacities[uri])
      }
    }, warmUpMs)
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
  for (var uri in this._servers) {
    this._servers[uri].connect()
    this._setTargetCapacity(uri)
  }
  this.emit('connect')
}

CacheCluster.prototype.disconnect = function () {
  this._state.shouldConnect = false
  for (var uri in this._servers) {
    this._resetCapacityInterval(uri)
    this._servers[uri].disconnect()
  }
  this.emit('disconnect')
}

CacheCluster.prototype._getCacheInstancesForKeys = function (keys) {
  var uris = this._hasher.getNodesForKeys(keys, this._clientsPerKey)

  var clients = {}, foundClients
  for (var key in uris) {
    foundClients = {}
    clients[key] = []
    for (var i = 0; i < uris[key].length; i++) {
      var uri = uris[key][i]
      if (foundClients[uri]) continue
      foundClients[uri] = true

      if (this._servers[uri] && this._servers[uri].isAvailable()) {
        clients[key].push({uri: uri, instance: this._servers[uri]})
      }
    }
  }

  return clients
}

CacheCluster.prototype.destroy = function () {
  this.disconnect()
  for (var uri in this._servers) {
    this._servers[uri].destroy()
    delete this._servers[uri]
  }
  this.emit('destroy')
}

function onError(e) {
  console.error(e)
  return undefined
}

CacheCluster.prototype.mget = function (keys) {
  var clients = this._getCacheInstancesForKeys(keys, this._opts.nodesPerRead)
  var servers = {}
  var serverArr = []
  var keyIndexes = {}

  // build up a list of keys and priorities for each client
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i]
    if (keyIndexes[key]) {
      keyIndexes[key].push(i)
      continue
    }
    keyIndexes[key] = [i]

    var keyClients = clients[key]
    for (var j = 0; j < keyClients.length; j++) {
      var keyClient = keyClients[j]
      if (!servers[keyClient.uri]) {
        servers[keyClient.uri] = {
          instance: keyClient.instance,
          keys: [],
          priorities: []
        }
      }

      servers[keyClient.uri].keys.push(keys[i])
      servers[keyClient.uri].priorities.push(j + 1)
    }
  }

  var promises = []
  for (var uri in servers) {
    var server = servers[uri]
    serverArr.push(server)
    promises.push(server.instance.mget(server.keys).fail(returnEmptyArr))
  }

  return Q.all(promises)
    .setContext({keys: keys, keyIndexes: keyIndexes, serverArr: serverArr})
    .then(processMgetResults)
}

CacheCluster.prototype.get = function (key) {
  return this.mget([key])
    .then(returnFirstResult)
}

CacheCluster.prototype.set = function (key, val, maxAgeMs) {
  var cacheInstances = this._getCacheInstancesForKeys([key], this._opts.nodesPerWrite)[key]
  if (!cacheInstances) return Q.resolve(true)
  var promises = []

  for (var i = 0; i < cacheInstances.length; i++) {
    promises.push(cacheInstances[i].instance.set(key, val, maxAgeMs))
  }

  return Q.all(promises).then(returnTrue)
}

CacheCluster.prototype.del = function (key) {
  var cacheInstances = this._getCacheInstancesForKeys([key], this._opts.nodesPerWrite)[key]
  if (!cacheInstances) return Q.resolve(true)
  var promises = []

  for (var i = 0; i < cacheInstances.length; i++) {
    promises.push(cacheInstances[i].instance.del(key))
  }

  return Q.all(promises).then(returnTrue)
}

/**
 * Iterate through all mget results and put them into an object
 * based on the order of keys provided
 *
 * @param  {Object} results [description]
 * @param  {{keys: Array.<string>, keyIndexes: Object, serverArr: Array.<Object>}} context information
 *     needed to put the results back into an array based on the key order originally provided
 * @return {Array.<Object>} the results from the cache
 */
function processMgetResults(results, context) {
  var keys = context.keys
  var keyIndexes = context.keyIndexes
  var serverArr = context.serverArr

  var resultArr = Array(keys.length)
  var resultPriorities = {}

  for (var i = 0; i < results.length; i++) {
    var serverResults = results[i]
    var server = serverArr[i]
    for (var j = 0; j < serverResults.length; j++) {
      var key = server.keys[j]
      var priority = server.priorities[j]
      if (!resultPriorities[key] || priority < resultPriorities[key]) {
        resultPriorities[key] = priority
        for (var k = 0; k < keyIndexes[key].length; k++) {
          resultArr[keyIndexes[key][k]] = serverResults[j]
        }
      }
    }
  }

  return resultArr
}

/**
 * Return the first result from a result set
 * @param  {Array.<Object>} results the results
 * @return {Object} the cached result
 */
function returnFirstResult(results) {
  return results[0]
}

/**
 * Always return true
 * @return {boolean} true!
 */
function returnTrue() {
  return true
}

/**
 * Always return an empty array
 * @return {Array} an empty array
 */
function returnEmptyArr() {
  return []
}

module.exports = CacheCluster