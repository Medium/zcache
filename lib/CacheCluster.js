var poolModule = require('generic-pool')
var util = require('util')
var Q = require('kew')

var CacheInstance = require('./CacheInstance')

function CacheCluster() {
  CacheInstance.call(this)

}
util.inherits(CacheCluster, CacheInstance)

module.exports = CacheCluster