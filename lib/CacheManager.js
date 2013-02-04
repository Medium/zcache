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
  return this.mget([key])
    .then(function (results) {
      return results[0]
    })
}

function chainGetPromise(currentPromise, key, nextClient) {
  // create the defer to grab the key from the next client
  var defer = Q.defer()
  nextClient.get(key, defer.makeNodeResolver())

  // no promise currently exists, return the first in the chain
  if (!currentPromise) return defer.promise

  // return the next in the chain
  return currentPromise
    .fail(function (e) {
      return defer.promise
    })
    .then(function (data) {
      return data || defer.promise
    })
}

function onError(e) {
  console.error(e)
  return undefined
}

CacheManager.prototype.mget = function (keys) {
  if (!this._sortedClusters.length) return Q.resolve([])
  var clients = this._getClosestClientsForKeys(keys)
  if (!clients) return Q.resolve([])

  var i, j
  var promises = []

  for (i = 0; i < keys.length; i++) {
    var key = keys[i]
    var keyClients = clients[key]
    var promise = undefined

    for (j = 0; j < keyClients.length; j++) {
      // for every client available to this
      promise = chainGetPromise(promise, key, keyClients[j])
    }

    promises.push(promise.fail(onError).then(function (data) {
      return data
    }))
  }

  return Q.all(promises)
    .then(function (data) {
      return data
    })
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