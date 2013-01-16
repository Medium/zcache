var Q = require('kew')

function CacheManager() {
  this._clusters = {}
  this._priorities = {}
  this._minPriority = null

  this._sortedClusters = []
}

CacheManager.prototype.addCluster = function (name, cluster, priority) {
  this._clusters[name] = cluster
  this._priorities[name] = priority

  this._sortClusters()
}

CacheManager.prototype.get = function (key) {
  if (!this._sortedClusters.length) return Q.resolve(undefined)
  var clients = this._getClosestClientsForKeys([key])[key]
  if (!clients || !clients.length) return Q.resolve(undefined)

  var i
  var deferreds = []

  // set up the deferreds for referencing by each other
  for (i = 0; i < clients.length; i++){
    var defer = Q.defer()
    clients[i].get(key, defer.makeNodeResolver())
    deferreds.push(defer.promise.fail(function (e) {
      return undefined
    }))
  }

  if (!deferreds.length) return Q.resolve(undefined)
  return deferreds.shift().promise.then(getFirstResponse.bind(null, deferreds))
}

function getFirstResponse(deferreds, data) {
  if (data) return data
  if (!deferreds.length) return undefined
  return deferreds.shift().promise.then(getFirstResponse.bind(null, deferreds))
}

CacheManager.prototype.set = function (key, val, lifetime) {
  if (!this._sortedClusters.length) return Q.resolve(true)
  var clients = this._getAllClientsForKeys([key])[key]
  var promises = []

  for (i = 0; i < clients.length; i++) {
    var defer = Q.defer()
    clients[i].set(key, val, lifetime || 0, defer.makeNodeResolver())

    promises.push(defer.promise.fail(function (e) {
      return true
    }))
  }

  return Q.all(promises).then(function () {
    return true
  })
}

CacheManager.prototype.stats = function (stats) {
  var allStats = {}
  var promises = []

  for (var key in this._clusters) {
    promises.push(this._clusters[key].getStats().then(function (data) {
      for (var key in data) {
        allStats[key] = data[key]
      }
    }))
  }

  return Q.all(promises)
    .then(function () {
      return allStats
    })
}

CacheManager.prototype.del = function (key) {
  if (!this._sortedClusters.length) return Q.resolve(true)
  var clients = this._getAllClientsForKeys([key])[key]
  var promises = []

  for (i = 0; i < clients.length; i++) {
    var defer = Q.defer()
    clients[i].delete(key, defer.makeNodeResolver())
    promises.push(defer.promise.fail(function () {
      return true
    }))
  }

  return Q.all(promises).then(function () {
    return true
  })
}

CacheManager.prototype._sortClusters = function () {
  this._sortedClusters = []
  this._minPriority = null

  for (var key in this._priorities) {
    var priority = this._priorities[key]
    var cluster = this._clusters[key]

    if (!this._sortedClusters[priority]) this._sortedClusters[priority] = []
    this._sortedClusters[priority].push(cluster)

    if (!this._minPriority || priority < this._minPriority) this._minPriority = priority
  }
}

CacheManager.prototype._getClosestClientsForKeys = function (keys) {
  var clients = {}
  var priority = this._minPriority
  var priorityIdx = 0
  var cluster, retrievedClients
  var remainingKeys = [].concat(keys)

  do {
    if (!this._sortedClusters[priority] || priorityIdx >= this._sortedClusters[priority].length) {
      priority++
      priorityIdx = 0
    } else {
      cluster = this._sortedClusters[priority][priorityIdx]
      retrievedClients = cluster.getClientsForKeys(remainingKeys)

      remainingKeys = []
      for (var key in retrievedClients) {
        if (retrievedClients[key].length) clients[key] = retrievedClients[key]
        else remainingKeys.push(key)
      }

      priorityIdx++
    }

  } while (remainingKeys.length && priority < this._sortedClusters.length)

  return clients
}

CacheManager.prototype._getAllClientsForKeys = function (keys) {
  var clients = {}
  var priority = this._minPriority
  var priorityIdx = 0
  var cluster, retrievedClients

  do {
    if (priorityIdx >= this._sortedClusters[priority].length) {
      priority++
      priorityIdx = 0
    } else {
      cluster = this._sortedClusters[priority][priorityIdx]
      retrievedClients = cluster.getClientsForKeys(keys)

      for (var key in retrievedClients) {
        if (!clients[key]) clients[key] = []
        for (var i = 0; i < retrievedClients[key].length; i++) {
          if (clients[key].indexOf(retrievedClients[key][i]) === -1) clients[key].push(retrievedClients[key][i])
        }
      }

      priorityIdx++
    }

  } while (priority < this._sortedClusters.length)

  return clients
}

module.exports = CacheManager