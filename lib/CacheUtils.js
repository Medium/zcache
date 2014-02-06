// Copyright 2014 A Medium Corporation.

/**
 * @fileoverview Cache Instance related utility methods
 */

/**
 * Merges pending requests count for a list of cache instances to a list
 * @param {Object} requestCounts map of cacheInstance uri and requests count
 * @param {Array<Object>} cacheInstances
 * @return {Array<Object>}
 */
function mergePendingRequestCounts(cacheInstances) {
  if (!cacheInstances) return []

  var requestCounts = []
  for (var i = 0; i < cacheInstances.length; i++) {
    var instanceRequestCounts = cacheInstances[i].getPendingRequestsCount()
    requestCounts = requestCounts.concat(instanceRequestCounts)
  }
  return requestCounts
}


module.exports = {
  mergePendingRequestCounts: mergePendingRequestCounts
}
