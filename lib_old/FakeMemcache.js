var events = require('events')
var util = require('util')

var memcacheData = {}

function FakeMemcache(port, host) {
  if (!memcacheData[port]) memcacheData[port] = {}
  if (!memcacheData[port][host]) memcacheData[port][host] = {}
  this._data = memcacheData[port][host]
}
util.inherits(FakeMemcache, events.EventEmitter)

FakeMemcache.prototype.connect = function (host, port, callback) {
  callback()
}

FakeMemcache.prototype.quit = function () {
  this.emit('close')
}

FakeMemcache.prototype.forceTimeout = function () {
  this.emit('timeout')
}

FakeMemcache.prototype.forceError = function (e) {
  this.emit('error', e)
}

FakeMemcache.prototype.set = function (key, val, flags, lifetimeSeconds, callback) {
  this._data[key] = new Buffer(String(val), 'utf8')
  callback(true)
}

FakeMemcache.prototype.get = function (key, callback) {
  callback(this._data[key] ? {body: this._data[key]} : {})
}

FakeMemcache.prototype.delete = function (key, callback) {
  if (this._data[key]) delete this._data[key]

  if (callback) callback(true)
}

module.exports = FakeMemcache