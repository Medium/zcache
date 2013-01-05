zcache: a cluster-aware consistent-hashing memcache manager for node.js
===

**zcache** is a memcache client manager which allows an application to set up connections to multiple groups of memcache servers with varying access priorities. Using consistent hashing and priorities for clusters (generally based upon closeness / latency) this allows for fast response times and maximized cache hit rates.

What is consistent hashing?
---
Consistent hashing is a particular kind of hashing where adding new slots (or memcache servers in this case) causes an optimal number of keys to be moved (# of keys / # of slots) as opposed to remapping the majority of keys. This is particularly useful when you wish to grow or shrink a cache cluster due to capacity or maintenance demands and wish to optimize the cache hit rate.

### How does **zcache** achieve consistent hashing?

**zcache** uses a ring-based hashing approach as described in the Wikipedia page for [Consistent Hashing](http://en.wikipedia.org/wiki/Consistent_hashing "Consistent Hashing"). The general flow for creating the ring looks like:

1. Create a ring / circle upon which to place server hash keys for lookups
2. For every server in the cluster and every unit of capacity for that server (where a server capacity is an arbitrary number of positions on the ring), create a hash (using sha1 or some other reasonably distributed hash algorithm) from the server host, port, and capacity unit index and add it to the ring (pointing back at the server)

In **zcache**'s case, the hash ring is actually a sorted array of hash keys and a map of those hash keys to servers. When it's time to find the servers for a given hash key, we create a hash of the key using the same algorithm and use a binary search to find the key (anything that falls before the first index on the hash array is mapped to the last index instead).

**zcache** also supports secondary and tertiary locations for each hash key and finds those by moving backwards from the point on the hash array of the primary key while looking for the next 2 unique servers (while there are additional unique servers in the array).

How do clusters work in **zcache**?
---

A cluster in **zcache** has a priority (lower == first to be read from) and a list of memcache servers and their capacities. The cluster will attempt to maintain a connection to each memcache server and will maintain a hash ring that is updated with changes to server capacities (based on calls to the cluster) as well as servers connecting and disconnecting.

```javascript
// create a new cluster and initialize the capacities to 100 each
var cluster = new require('zcache').CacheCluster()
cluster.setServerCapacity('localhost:11212', 100)
cluster.setServerCapacity('localhost:11213', 100)
```

When you wish to add a new server to the cluster you can specify the desired capacity and the (optional) number of milliseconds to spend between adding each new capacity unit:

```javascript
// this will take 100 seconds to ramp to full capacity
cluster.setServerCapacity('localhost:11214', 100, 1000)
```

You can also remove a server from the cluster by setting the capacity to 0 (with an optional number of milliseconds to spend ramping down):

```javascript
// this will take 50 seconds to remove from the pool
cluster.setServerCapacity('localhost:11212', 0, 500)
```

At any point you may request a list of current and target capacities for all servers in a cluster by calling `.getServerCapacities()`:

```javascript
var capacities = cluster.getServerCapacities()
for (var hosts in capacities) {
  console.log(host, capacities[host].current, capacities[host].target)
}
```

Putting it all together
---

To use **zcache**, you create a `CacheManager` instance and add multiple `CacheCluster` instances to it with varying priorities:

```javascript
var zcache = require('zcache')
var cacheManager = new zcache.CacheManager()

var primaryCluster = new zcache.CacheCluster()
primaryCluster.setServerCapacity('localhost:11212', 5)
primaryCluster.setServerCapacity('localhost:11213', 5) cacheManager.addCluster('primary', primaryCluster, 1)

var secondaryCluster = new zcache.CacheCluster()
secondaryCluster.setServerCapacity('localhost:11214', 100)
secondaryCluster.setServerCapacity('localhost:11215', 100)
cacheManager.addCluster('secondary', secondaryCluster, 2)
```

### Using the cache

Once the `CacheManager` instance is created, you may call the `.get()`, `.set()`, and `.del()` methods on it.

`.get()` will attempt to find servers in the lowest priority cluster and will continue iterating through higher priority servers until a cluster is found with valid connections to memcache instances. Once a valid set of servers is found, `.get()` will query the primary, secondary (if it exists), and tertiary (if it exists) instances simultaneously and return the value found in the primary first (if any), then the secondary (if found) or finally, the tertiary.

```javascript
cacheManager.get('user-123')
  .then(function (user) {
    if (user) {
      // user was found!
      return user
    } else {
      // user was not found
    }
  })
```

`.set()` and `.del()` will find all primary, secondary, and tertiary servers in all clusters and send update commands to each.

```javascript
// set a user
cacheManager.set('user-123')
  .then(function (done) {
    console.log("Finished setting user")
  })

// delete a user
cacheManager.del("user-456")
  .then(function (done) {
    console.log("Finished deleting user")
  })
```

Contributing
------------

Questions, comments, bug reports, and pull requests are all welcome.
Submit them at [the project on GitHub](https://github.com/azulus/zcache/).

Bug reports that include steps-to-reproduce (including code) are the
best. Even better, make them in the form of pull requests that update
the test suite. Thanks!


Author
------

[Jeremy Stanley](https://github.com/azulus)


License
-------

Copyright 2013 [Jeremy Stanley](https://github.com/azulus).

Licensed under the Apache License, Version 2.0.
See the top-level file `LICENSE.TXT` and
(http://www.apache.org/licenses/LICENSE-2.0).