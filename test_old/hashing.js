var Q = require('kew')
var ConsistentHasher = require('../lib/ConsistentHasher')

exports.setUp = function (done) {
  this.hasher = new ConsistentHasher
  done()
}

exports.testBadKey = function (test) {
  this.hasher.setNodeCapacity('first', 10)
  this.hasher.setNodeCapacity('second', 10)

  this.hasher.getNodesForKeys([undefined, null, 'abc', 123, {name: 'jeremy'}])
  test.done()
}

exports.testSimple = function (test) {
  var keys = []
  for (var i = 0; i < 20; i++) {
    keys.push('test-' + i)
  }

  var results = []

  // init with only a single cache server with 5 node points
  this.hasher.setNodeCapacity('first', 10)
  var previousNodes = this.hasher.getNodesForKeys(keys, 3)

  // add a second
  this.hasher.setNodeCapacity('second', 3)
  results.push({nodes: this.hasher.getNodesForKeys(keys, 3), shouldExist: ['first', 'second'], canGain: 'second'})

  // ramp up the second
  this.hasher.setNodeCapacity('second', 6)
  results.push({nodes: this.hasher.getNodesForKeys(keys, 3), shouldExist: ['first', 'second'], canGain: 'second'})

  // finish ramping up the second
  this.hasher.setNodeCapacity('second', 10)
  results.push({nodes: this.hasher.getNodesForKeys(keys, 3), shouldExist: ['first', 'second'], canGain: 'second'})

  // add a third
  this.hasher.setNodeCapacity('third', 5)
  results.push({nodes: this.hasher.getNodesForKeys(keys, 3), shouldExist: ['first', 'second', 'third'], canGain: 'third'})

  // finish ramping up the third
  this.hasher.setNodeCapacity('third', 10)
  results.push({nodes: this.hasher.getNodesForKeys(keys, 3), shouldExist: ['first', 'second', 'third'], canGain: 'third'})

  // start spinning down the first
  this.hasher.setNodeCapacity('first', 5)
  results.push({nodes: this.hasher.getNodesForKeys(keys, 3), shouldExist: ['first', 'second', 'third'], canLose: 'first'})

  // finish spinning down the first
  this.hasher.setNodeCapacity('first', 0)
  results.push({nodes: this.hasher.getNodesForKeys(keys, 3), shouldExist: ['second', 'third'], canLose: 'first'})

  var i
  while (results.length) {
    var currentResults = results.shift()
    var nodes = currentResults.nodes

    var exists = {}
    var canGain = null
    var canLose = null

    if (currentResults.shouldExist) {
      // set up a map for whether nodesexist or not
      for (var i = 0; i < currentResults.shouldExist.length; i++) {
        exists[currentResults.shouldExist[i]] = false
      }
    }

    if (currentResults.canGain) canGain = currentResults.canGain
    if (currentResults.canLose) canLose = currentResults.canLose

    for (var key in nodes) {
      for (i = 0; i < nodes[key].length; i++) {
        var oldNode = previousNodes[key][i]
        var newNode = nodes[key][i]

        // mark the node as existing
        exists[nodes[key][i]] = true

        if (oldNode == newNode) continue

        if (!canGain && !canLose) test.fail("node '" + oldNode + "' should not lose keys (lost to '" + newNode + "')")

        // if a node is gaining and it shouldn't, error out
        if (canGain && i === 0 && newNode != canGain) test.fail("node '" + newNode + "' should not be the first key")

        // make sure the rest of the array isn't changing
        if (canLose && i !== 0 && nodes[key][i] == canGain) test.fail("node '" + newNode + "' is still the first key but the rest of the array has changed")
      }
    }

    for (var key in exists) {
      test.equal(exists[key], true, "'" + key + "' should exist")
    }

    previousNodes = nodes
  }
  test.done()

}