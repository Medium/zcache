var redis = require('redis')
var util = require('util')
var Q = require('kew')

var CacheInstance = require('./CacheInstance')
var ServerInfo = require('./ServerInfo')

/**
 * A connection to a Redis server.
 *
 * @constructor
 * @param {string} host The host that runs the redis-server
 * @param {string} port The port that the redis-server listens to
 * @implements {CacheInstance}
 */
function RedisConnection(host, port) {
  CacheInstance.call(this)

  this._isAvailable = false
  this._client = null
  this._host = host || null
  this._port = port || null
  this._bound_onConnect = this._onConnect.bind(this)
  this._bound_onError = this._onError.bind(this)
  this._bound_onEnd = this._onEnd.bind(this)
}
util.inherits(RedisConnection, CacheInstance)

/** @inheritDoc */
RedisConnection.prototype.isAvailable = function () {
  return this._isAvailable
}

/** @inheritDoc */
RedisConnection.prototype.set = function (key, val, maxAgeMs) {
  var deferred = Q.defer()
  this._client.setex(key, Math.floor(maxAgeMs / 1000), val, deferred.makeNodeResolver())
  return deferred.promise
    .fail(warnOnError)
    .then(this.updateStats('set'))
}

/** @inheritDoc */
RedisConnection.prototype.mset = function (items, maxAgeMs) {
  var deferred = Q.defer()
  var msetCommand = ["MSET"]
  var commands = [msetCommand]
  for (var i = 0, l = items.length; i < l; i++) {
    var key = items[i].key
    // Append key value arguments to the set command.
    msetCommand.push(key, items[i].value)
    // Append an expire command.
    commands.push(["EXPIRE", key, Math.floor(maxAgeMs / 1000)])
  }
  this._client.multi(commands).exec(deferred.makeNodeResolver())

  return deferred.promise
    .fail(warnOnError)
    .then(this.updateStats('mset'))
}

/** @inheritDoc */
RedisConnection.prototype.del = function (key) {
  var deferred = Q.defer()
  this._client.del(key, deferred.makeNodeResolver())
  return deferred.promise
    .fail(warnOnError)
    .then(this.updateStats('del'))
}

/** @inheritDoc */
RedisConnection.prototype.get = function (key) {
  return this.mget([key])
    .then(returnFirstResult)
    .then(this.updateStats('get'))
}

/** @inheritDoc */
RedisConnection.prototype.mget = function (keys) {
  if (!keys || !keys.length) return Q.resolve([])

  var deferred = Q.defer()
  this._client.mget(keys, deferred.makeNodeResolver())
  return deferred.promise
    .then(function (vals) {
      // This function post-processes values from Redis client to
      // make cache miss result consistent with the API.
      //
      // Redis client returns null objects for cache misses, and we
      // turn them into undefined.
      for (var i = 0; i < vals.length; i++) {
        if (null === vals[i]) vals[i] = undefined
      }
      return vals
    })
    .then(this.updateCount())
    .then(this.updateStats('mget'))
}

/** @inheritDoc */
RedisConnection.prototype.getServerInfo = function () {
  var deferred = Q.defer()
  this._client.info(deferred.makeNodeResolver())
  return deferred.promise
    .then(function (infoCmdOutput) {
      var items = {}
      infoCmdOutput.split('\n')
        .filter(function(str) {return str.indexOf(':') > 0})
        .map(function(str) {return str.trim().split(':')})
        .map(function(item) {items[item[0]] = item[1]})
      var serverInfo = new ServerInfo
      try {
        serverInfo.memoryBytes = parseInt(items['used_memory'], 10)
        serverInfo.memoryRssBytes = parseInt(items['used_memory_rss'], 10)
        serverInfo.evictedKeys = parseInt(items['evicted_keys'], 10)
        serverInfo.numOfConnections = parseInt(items['connected_clients'], 10)
        // The db0 key's value is something like: 'keys=12,expires=20'
        serverInfo.numOfKeys = parseInt(items['db0'].split(',')[0].split('=')[1], 10)
      } catch (e) {
        Q.reject('Malformatted output from the "INFO" command of Redis')
      }
      return Q.resolve(serverInfo)
    })
}

/** @inheritDoc */
RedisConnection.prototype.disconnect = function () {
  this._isAvailable = false
  this._client.quit()
  this.emit('disconnect')
}

/** @inheritDoc */
RedisConnection.prototype.destroy = function () {
  this.disconnect()
  delete this._client
  this.emit('destroy')
}

/** @inheritDoc */
RedisConnection.prototype.connect = function () {
  if (this._isAvailable) return

  if (this._client) {
    this._client.removeListener('connect', this._bound_onConnect)
    this._client.removeListener('error', this._bound_onError)
    this._client.removeListener('end', this._bound_onEnd)
  }

  this._client = redis.createClient(this._port, this._host)
  this._client.on('connect', this._bound_onConnect)
  this._client.on('error', this._bound_onError)
  this._client.on('end', this._bound_onEnd)
}

RedisConnection.prototype._onConnect = function () {
  this._isAvailable = true
  this.emit('connect')
}

RedisConnection.prototype._onError = function (e) {
  this.emit('error', e)
}

RedisConnection.prototype._onEnd = function () {
  this._isAvailable = false
  this.emit('disconnect')
}

/**
 * Warn when an error occurs but continue
 *
 * @param  {Error} e the error
 * @return {boolean} true
 */
function warnOnError(e) {
  // if the cache set failed for some reason, warn but continue
  console.warn(e)
  return true
}

/**
 * Return the first result from a result set
 * @param  {Array.<Object>} results the results
 * @return {Object} the cached result
 */
function returnFirstResult(results) {
  return results[0]
}

module.exports = RedisConnection
