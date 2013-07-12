var redis = require('redis')
var util = require('util')
var Q = require('kew')

var CacheInstance = require('./CacheInstance')

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

RedisConnection.prototype.isAvailable = function () {
  return this._isAvailable
}

RedisConnection.prototype.set = function (key, val, maxAgeMs) {
  var deferred = Q.defer()
  this._client.psetex(key, maxAgeMs, val, deferred.makeNodeResolver())

  return deferred.promise
    .fail(warnOnError)
}

RedisConnection.prototype.mset = function (objects, maxAgeMs) {
  var deferred = Q.defer()
  var msetCommand = ["MSET"]
  var commands = [msetCommand]
  for (var key in objects) {
    // Append key value arguments to the set command.
    msetCommand.push(key, objects[key])
    // Append an expire command.
    commands.push(["PEXPIRE", key, maxAgeMs])
  }
  this._client.multi(commands).exec(deferred.makeNodeResolver())

  return deferred.promise
    .fail(warnOnError)
}

RedisConnection.prototype.del = function (key) {
  var deferred = Q.defer()
  this._client.del(key, deferred.makeNodeResolver())

  return deferred.promise
    .fail(warnOnError)
}

RedisConnection.prototype.get = function (key) {
  return this.mget([key])
    .then(returnFirstResult)
}

RedisConnection.prototype.mget = function (keys) {
  if (!keys || !keys.length) return Q.resolve([])

  var deferred = Q.defer()
  var args = keys.concat(deferred.makeNodeResolver())
  this._client.mget.apply(this._client, args)
  return deferred.promise
}

RedisConnection.prototype.disconnect = function () {
  this._isAvailable = false
  this._client.quit()
  this.emit('disconnect')
}

RedisConnection.prototype.destroy = function () {
  this.disconnect()
  delete this._client
  this.emit('destroy')
}

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
