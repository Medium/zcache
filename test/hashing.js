var ConsistentHasher = require('../lib/ConsistentHasher')

exports.setUp = function (done) {
  this.hasher = new ConsistentHasher
  done()
}

exports.testSimple = function (test) {
  this.hasher.setNodePoints('first', 5)
  this.hasher.setNodePoints('second', 5)
  this.hasher.setNodePoints('third', 5)

  var nodes = this.hasher.getNodesForKeys([
    'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u'
  ], 3)

  test.done()
}