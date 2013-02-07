var poolModule = require('generic-pool')
var memc = require('node-memcache-parser-obvfork').client

function CacheConnectionPool(host, port) {
  var self = this
  this._host = host
  this._port = port

  this._pool = poolModule.Pool({
    name: 'memcache-' + host + ':' + port,

    // function for creating a new client
    create: this._createConnection.bind(this, 100),

    // function for destroying an existing client
    destroy: this._destroyConnection.bind(this)

    // min number of connections in the pool
    min: 5,

    // max number of connections int he pool
    max: 100,

    // number of milliseconds before releasing a resource in the pool
    idleTimeoutMillis: 30000,

    // enable logging?
    log: true
  })

  setInterval(function () {
    pool.getPoolSize()
  }, 2000)
}

CacheConnectionPool.prototype._createConnection = function (maxMillis, callback) {
  var client = new memc.Connection()

  client.on('error', function () {
    console.log("Unable to close client")
  })

  client.on('close', function () {
    console.log("Closing client")
  })

  console.log("Connecting to client")
  client.connect(this._port, this._host, function () {
    console.log("Connected to client")
    callback(null, client)
  })
}

CacheConnectionPool.prototype._destroyConnection = function (client) {
  client.quit(function () {
    console.log("Closing client")
  })
}

CacheConnectionPool.getConnection = function (timeoutMs) {
  var resolved = false
  var defer = Q.defer()

  if (timeoutMs > 0) {
    setTimeout(function () {
      defer.resolve(resolved = true)
    }, timeoutMs)
  }

  this._pool.acquire(function (err, client) {
    if (resolved) return
    resolved = true
    defer.resolve(client)
  })
}

CacheConnectionPool.releaseConnection = function () {
  this._pool.release(client)
}

module.exports = CacheConnectionPool