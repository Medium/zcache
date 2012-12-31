var crypto = require('crypto')

function ConsistentHasher(options) {
  options = options || {}

  this._pointsIndex = []
  this._points = {}
  this._pointCounts = {}
  this.algorithm = options.algorithm || 'sha1'
}

ConsistentHasher.prototype.setNodePoints = function (nodeName, numPoints) {
  var currentNumPoints = this._pointCounts[nodeName] || 0

  if (numPoints < currentNumPoints) {
    // removing some capacity from this node
    for (var i = numPoints; i < currentNumPoints; i++) {
      this._removeNodePoint(nodeName, i)
    }
  } else if (numPoints > currentNumPoints) {
    // adding some capacity to this node
    for (var i = currentNumPoints; i < numPoints; i++) {
      this._addNodePoint(nodeName, i)
    }
  }

  this._pointCounts[nodeName] = numPoints
  this._pointsIndex = Object.keys(this._points).sort()
}

ConsistentHasher.prototype.getNodesForKeys = function (keys, nodesPer) {
  var i, j, key
  var results = {}
  nodesPer = nodesPer || 2

  // create a map of hashes to the keys they correspond to and the index
  // they should be returned at
  var singleMapping
  var hashMapping = {}
  for (i = 0; i < keys.length; i++) {
    results[keys[i]] = []
    for (j = 0; j < nodesPer; j++) {
      hashMapping[this._generateHash(j + ':' + keys[i])] = {
        key: keys[i],
        idx: j
      }
    }
  }

  // sort the hashes and find our binary search bounds
  var hashes = Object.keys(hashMapping).sort()
  var hashResults = this._searchNodesForKeys(hashes)

  // test the ordering
  /*
  var maxKey
  var currentPoint = this._pointsIndex[this._pointsIndex.length - 1]
  var resultKeys = Object.keys(hashResults).sort()
  for (i = 0; i < resultKeys.length; i++) {
    key = resultKeys[i]

    if (hashResults[key] !== currentPoint) {
      currentPoint = hashResults[key]
      if (maxKey && currentPoint <= maxKey) throw new Error('noo')
      else console.log(currentPoint + " > " + maxKey)
    }

    maxKey = key
  }
  */

  for (key in hashResults) {
    singleMapping = hashMapping[key]
    results[singleMapping.key][singleMapping.idx] = this._points[hashResults[key]]
  }

  return results
}

ConsistentHasher.prototype._searchNodesForKeys = function (hashes) {
  var i
  var hashResults = {}
  var searchRanges = []
  var hashStart = 0, hashEnd = hashes.length - 1, hashMid, testHash
  var pointStart = 0, pointEnd = this._pointsIndex.length - 1, pointMid, pointHash

  while (hashStart <= hashEnd && hashes[hashStart] < this._pointsIndex[pointStart]) {
    // this should wrap around from the last node to the first
    hashResults[hashes[hashStart]] = this._pointsIndex[pointEnd]
    hashStart++
  }

  while (hashEnd >= hashStart && hashes[hashEnd] >= this._pointsIndex[pointEnd]) {
    hashResults[hashes[hashEnd]] = this._pointsIndex[pointEnd]
    hashEnd--
  }

  if (hashStart < hashEnd) {
    // add a search range if we didn't find all results in the first pass
    searchRanges.push({
      hashStart: hashStart,
      hashEnd: hashEnd,
      pointStart: pointStart,
      pointEnd: pointEnd
    })
  }

  while (searchRanges.length) {
    var range = searchRanges.pop()
    var done = false

    pointStart = range.pointStart
    pointEnd = range.pointEnd
    pointMid = Math.floor((pointEnd - pointStart)/2) + pointStart
    pointHash = this._pointsIndex[pointMid]

    hashStart = range.hashStart
    hashEnd = range.hashEnd
    if (pointEnd <= pointStart + 1) {
      for (i = hashStart; i <= hashEnd; i++) {
        hashResults[hashes[i]] = this._pointsIndex[pointStart]
      }
      continue
    }

    do {
      // subdivide the hash space around the mid point generated
      hashMid = Math.floor((hashEnd - hashStart)/2) + hashStart
      testHash = hashes[hashMid]

      if (hashStart >= hashEnd - 1) {
        done = true
      } else if (testHash >= pointHash) {
        hashEnd = hashMid
      } else {
        hashStart = hashMid
      }
    } while (!done)

    testHash = hashes[hashMid]

    if (range.hashStart < hashMid) {
      // anything to the left of the mid point
      searchRanges.push({
        pointStart: pointStart,
        pointEnd: pointMid,
        hashStart: range.hashStart,
        hashEnd: hashMid
      })
    }

    if (range.hashEnd > hashMid) {
      searchRanges.push({
        pointStart: pointMid,
        pointEnd: pointEnd,
        hashStart: hashMid,
        hashEnd: range.hashEnd
      })
    }
  }

  return hashResults
}


ConsistentHasher.prototype._addNodePoint = function (nodeName, idx) {
  var hash = this._generateHash(this._generateNodePointHashKey(nodeName, idx))
  this._points[hash] = nodeName
}

ConsistentHasher.prototype._removeNodePoint = function (nodeName, idx) {
  var hash = this._generateHash(this._generateNodePointHashKey(nodeName, idx))
  delete this._points[hash]
}

ConsistentHasher.prototype._generateNodePointHashKey = function (nodeName, idx) {
  return idx + ':' + nodeName
}

ConsistentHasher.prototype._generateHash = function (key) {
  return crypto.createHash(this.algorithm).update(key).digest('hex')
}

module.exports = ConsistentHasher