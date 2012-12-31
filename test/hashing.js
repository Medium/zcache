var Q = require('kew')
var ConsistentHasher = require('../lib/ConsistentHasher')

exports.setUp = function (done) {
  this.hasher = new ConsistentHasher
  done()
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
  results.push({nodes: this.hasher.getNodesForKeys(keys, 3), shouldExist: ['first', 'second'], canGain: ['second'], shouldRetain: ['second']})

  // ramp up the second
  this.hasher.setNodeCapacity('second', 6)
  results.push({nodes: this.hasher.getNodesForKeys(keys, 3), shouldExist: ['first', 'second'], canGain: ['second'], shouldRetain: ['second']})

  // finish ramping up the second
  this.hasher.setNodeCapacity('second', 10)
  results.push({nodes: this.hasher.getNodesForKeys(keys, 3), shouldExist: ['first', 'second'], canGain: ['second'], shouldRetain: ['second']})

  // add a third
  this.hasher.setNodeCapacity('third', 5)
  results.push({nodes: this.hasher.getNodesForKeys(keys, 3), shouldExist: ['first', 'second', 'third'], canGain: ['third'], shouldRetain: ['third']})

  // finish ramping up the third
  this.hasher.setNodeCapacity('third', 10)
  results.push({nodes: this.hasher.getNodesForKeys(keys, 3), shouldExist: ['first', 'second', 'third'], canGain: ['third'], shouldRetain: ['third']})

  // start spinning down the first
  this.hasher.setNodeCapacity('first', 5)
  results.push({nodes: this.hasher.getNodesForKeys(keys, 3), shouldExist: ['first', 'second', 'third'], canGain: ['second', 'third'], shouldRetain: ['second', 'third']})

  // finish spinning down the first
  this.hasher.setNodeCapacity('first', 0)
  results.push({nodes: this.hasher.getNodesForKeys(keys, 3), shouldExist: ['second', 'third'], canGain: ['second', 'third'], shouldRetain: ['second', 'third']})

  var i
  while (results.length) {
    var currentResults = results.shift()
    var nodes = currentResults.nodes

    var exists = {}
    var canGain = {}
    var shouldRetain = {}

    if (currentResults.shouldExist) {
      // set up a map for whether nodesexist or not
      for (var i = 0; i < currentResults.shouldExist.length; i++) {
        exists[currentResults.shouldExist[i]] = false
      }
    }

    if (currentResults.canGain) {
      // set up a map for nodes that should be allowed to gain keys
      for (i = 0; i < currentResults.canGain.length; i++) {
        canGain[currentResults.canGain[i]] = true
      }
    }

    if (currentResults.shouldRetain) {
      // set up a map for nodes that should not lose keys
      for (i = 0; i < currentResults.shouldRetain.length; i++) {
        shouldRetain[currentResults.shouldRetain[i]] = true
      }
    }

    for (var key in nodes) {
      for (i = 0; i < nodes[key].length; i++) {
        var oldNode = previousNodes[key][i]
        var newNode = nodes[key][i]

        // mark the node as existing
        exists[nodes[key][i]] = true

        if (oldNode == newNode) continue

        // if the node is gaining and it shouldn't, error out
        if (!canGain[newNode]) test.fail("node '" + newNode + "' should not gain new keys (gained from '" + oldNode + "')")

        // if the node isnt retaining and it should, error
        if (shouldRetain[oldNode]) test.fail("node '" + oldNode + "' should retain existing keys (lost to '" + oldNode + "')")
      }
    }

    for (var key in exists) {
      test.equal(exists[key], true, "'" + key + "' should exist")
    }

    previousNodes = nodes
  }

  test.done()

}