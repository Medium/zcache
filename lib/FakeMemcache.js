var events = require('events')
var util = require('util')

var memcacheData = {}

function FakeMemcache(port, host) {
  if (!memcacheData[port]) memcacheData[port] = {}
  if (!memcacheData[port][host]) memcacheData[port][host] = {}
  this._data = memcacheData[port][host]
}
util.inherits(FakeMemcache, events.EventEmitter)

FakeMemcache.prototype.connect = function () {
  this.emit('connect')
}

FakeMemcache.prototype.close = function () {
  this.emit('close')
}

FakeMemcache.prototype.forceTimeout = function () {
  this.emit('timeout')
}

FakeMemcache.prototype.forceError = function (e) {
  this.emit('error', e)
}

FakeMemcache.prototype.set = function (key, val, callback, lifetimeMs) {
  this._data[key] = val
  callback(null, true)
}

FakeMemcache.prototype.get = function (key, callback) {
  if (this._data[key]) {
    callback(null, this._data[key])
  } else {
    callback(null, undefined)
  }
}

FakeMemcache.prototype.delete = function (key, callback) {
  if (this._data[key]) delete this._data[key]

  if (callback) callback(null, true)
}

module.exports = FakeMemcache