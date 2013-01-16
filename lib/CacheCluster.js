var CacheServer = require('./CacheServer')
var ConsistentHasher = require('./ConsistentHasher')

var common = require('./common')

function CacheCluster(options) {
  options = options || {}

  this._clientsPerKey = options.clientsPerKey || 3
  this._clientCtor = options.clientCtor
  this._servers = {}
  this._hasher = new ConsistentHasher
}

/**
 * Set the capacity for a server
 *
 * @param {string} uri colon-delimited uri with port
 * @param {number} capacity the capacity for the server
 * @param {number} msPerCapacityUnit number of milliseconds between capacity units
 */
CacheCluster.prototype.setServerCapacity = function (uri, capacity, msPerCapacityUnit) {
  if (!this._servers[uri]) {
    this._servers[uri] = new CacheServer(this._clientCtor, uri)
    this._servers[uri].on('capacity', this._onCapacity.bind(this, uri))
    this._servers[uri].on('error', function () {})
  }

  try {
    this._servers[uri].setCapacity(capacity, msPerCapacityUnit)
  } catch (e) {
    console.error(e.stack)
  }

}

/**
 * Retrieve an array of memcache clients for each key requested
 *
 * @param {Array.<string>} keys an array of keys
 * @return {Object} a map of keys to arrays of memcache clients
 */
CacheCluster.prototype.getClientsForKeys = function (keys) {
  var uris = this._hasher.getNodesForKeys(keys, this._clientsPerKey)

  var clients = {}, foundClients
  for (var key in uris) {
    foundClients = {}
    clients[key] = []
    for (var i = 0; i < uris[key].length; i++) {
      var uri = uris[key][i]
      if (foundClients[uri]) continue
      foundClients[uri] = true

      if (this._servers[uri] && this._servers[uri].getStatus() === common.SERVER_STATUS.CONNECTED) {
        clients[key].push(this._servers[uri].getClient())
      }
    }
  }

  return clients
}

CacheCluster.prototype.getStats = function (key) {
  var stats = {}
  var promises = []

  for (var uri in this._servers) {
    if (this._servers[uri].getStatus() === common.SERVER_STATUS.CONNECTED) {
      (function (uri) {
        var defer = Q.defer()
        this._servers[uri].getClient().stats(key, defer.makeNodeResolver())
        promises.push(defer.promise.then(function (data) {
          stats[uri] = data
        }))
      })(uri)
    } else {
      stats[uri] = {
        status: "disconnected"
      }
    }
  }

  return Q.all(promises)
    .then(function () {
      return stats
    })
}

/**
 * Retrieve a map of servers to their capacities
 *
 * @return {Object} a map of uris to their capacities
 */
CacheCluster.prototype.getServerCapacities = function () {
  var capacities = {}

  for (var key in this._servers) {
    capacities[key] = {
      current: this._servers[key].getCurrentCapacity(),
      target: this._servers[key].getTargetCapacity()
    }
  }

  return capacities
}

/**
 * Respond to capacity changes from the cache server by updating the
 * consistent hasher
 *
 * @param {string} uri
 * @param {number} capacity
 */
CacheCluster.prototype._onCapacity = function (uri, capacity) {
  if (capacity === 0) {
    this._servers[uri].close()
    delete this._servers[uri]
  }

  this._hasher.setNodeCapacity(uri, capacity)
}

module.exports = CacheCluster