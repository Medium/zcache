var zcache = require('../index')

exports.testMemcacheConnection = function (test) {
  var connection = new zcache.MemcacheConnection("localhost", 11212)

  test.equal(connection.isAvailable(), false, "Connection should not be available")

  connection.on('connect', function () {
    test.equal(connection.isAvailable(), true, "Connection should be available")

    connection.set('abc', '123', 300000)
      .then(function () {
        return connection.mget(['abc'])
      })
      .then(function (vals) {
        test.equal(vals[0], '123')
        return connection.del('abc')
      })
      .then(function () {
        return connection.mget(['abc'])
      })
      .then(function (vals) {
        test.equal(vals[0], undefined)
        connection.destroy()
      })
      .fail(function (e) {
        console.error(e)
        test.fail(e.message)
        test.done()
      })
  })

  connection.on('destroy', function () {
    test.equal(connection.isAvailable(), false, "Connection should not be available")
    test.done()
  })

  connection.connect()
}