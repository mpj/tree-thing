var chai = require('chai')
var expect = chai.expect
chai.should()
var Q = require('q')
Q.longStackSupport = true;
var forEach = require('mout/array/forEach')
var combine = require('mout/array/combine')
var append = require('mout/array/append')
var deepClone = require('mout/lang/deepClone')

// Not using mouts deepEquals because we need array support.
var deepEquals = require('deep-equal')


// TODO: duplication between put/remove
// TODO: Stream for root node
// TODO: Ignore trailing slash
var TreeThing = {
  ensureInit: function() {
    this._changes  = this._changes || []
    this._watchers = this._watchers || []
  },
  _generateTreeFromChanges: function(until) {
    var root = {}
    forEach(this._changes, function(change, i) {
      change = deepClone(change)
      var cursor = root
      var pathPaths = change.path.split('/')
      pathPaths.forEach(function(part, i) {
        if(part === '') return; // Skip root
        var isLast = i + 1 === pathPaths.length
        if (isLast) {
          if (change.type === 'put') {
            cursor[part] = change.data
          } else if (change.type === 'remove') {
            delete cursor[part]
          }
        } else {
          cursor = cursor[part] = cursor[part] || {}
        }
      })
      if (i === until) return false;
    })
    return root
  },
  _notifyAboutChanges: function(path, before, after) {
    var me = this
    var partialPathParts = []

    return Q.all(
      // Generate all paths that are dependent on
      // this change.
      path.split('/').map(function(part) {
        partialPathParts.push(part)
        var partialPath = partialPathParts.join('/')
        if (partialPath === '') return '/';
        return partialPath
      }).map(function(notifyPath) {

        if (!me._watchers[notifyPath] ||
             me._watchers[notifyPath].length === 0) {
          // Nothing listening on this path, don't bother
          // doing any work.
          console.log("nope, nuthing listening to", notifyPath)
          return Q(true);
        }
        console.log("path", notifyPath, "has watchers")
        // Only notify the watcher if the change actually caused
        // the result to change.
        return Q.spread([
          me.snapshot(notifyPath, before),
          me.snapshot(notifyPath, after)
        ], function(beforeValue, afterValue) {
          if (!deepEquals(beforeValue, afterValue)) {
            me._watchers[notifyPath].forEach(function(watcher) {

              watcher(afterValue)
            })
          }

        })
      })
    )
  },
  put: function(path, data) {
    path = path.indexOf('/') == 0 ? path : '/' + path
    var me = this;
    me.ensureInit()

    var beforeChangeSequence = me._changes.length - 1

    me._changes.push({
      type: 'put',
      path: path,
      data: data
    });

    var afterChangeSequence = me._changes.length - 1

    return me._notifyAboutChanges(path, beforeChangeSequence, afterChangeSequence)
      .then(function() {
        return afterChangeSequence
      })
  },
  remove: function(path) {
    path = path.indexOf('/') == 0 ? path : '/' + path
    var me = this;
    this.ensureInit()
    var beforeChangeSequence = me._changes.length - 1
    this._changes.push({
      type: 'remove',
      path: path
    })
    var afterChangeSequence = me._changes.length - 1
    return me._notifyAboutChanges(path, beforeChangeSequence, afterChangeSequence)
      .then(function() {
        return afterChangeSequence
      })
  },
  snapshot: function(path, until) {
    path = path.indexOf('/') === 0 ? path : '/' + path
        console.log("snapshotting", path)
    if (until === -1) return Q(null);
    this.ensureInit()
    var root = this._generateTreeFromChanges(until);
    var cursor = root;
    console.log("root is", cursor)
    var pathParts = path.split('/')
    forEach(pathParts, function(part) {
      if(part === '') return true; // Skip root
      if (!cursor[part]) {
        console.log("hai", part, cursor)
        // Path does not exist, just return null
        cursor = null
        return false
      }
      cursor = cursor[part]
    })
    console.log("snapshot result", cursor)

    return Q(cursor)
  },
  stream: function(path) {
    path = path.indexOf('/') == 0 ? path : '/' + path
    var me = this
    me.ensureInit()

    return {
      onChange: function(fn) {
        me._watchers[path] = me._watchers[path] || []
        me._watchers[path].push(fn)
        me.snapshot(path).then(fn)
      }
    }
  }
}

describe('When we have a thing', function() {
  var tt;
  beforeEach(function() {
    tt = Object.create(TreeThing)
  })

  xit('should be possible to insert and snapshot a node (heirarchy)', function(done) {
    tt.put('animals/dogs/chiuauas', [{ name: 'Caitlin' }])
    tt.snapshot('animals/dogs').then(function(s) {
      s.chiuauas[0].name.should.equal('Caitlin')
    })
    .done(done)
  })

  xit('removes nodes', function(done) {
    tt.put('animals/dogs', {}).then(function() {
      return tt.put('animals/cats', {})
    }).then(function() {
      return tt.snapshot('animals')
    }).then(function(animals) {
      animals.cats.should.exist
      animals.dogs.should.exist
    }).then(function() {
      return tt.remove('animals/dogs')
    }).then(function() {
      return tt.snapshot('animals')
    }).then(function(animals) {
      expect(animals.cats).to.exist
      expect(animals.dogs).to.not.exist
    })
    .done(done)

  })

  xit('should be possible to snapshots old versions', function(done) {
    tt.put('animals/dogs/chiuauas', [{ name: 'Caitlin' }]).then(function(sequenceNumber) {
      sequenceNumber.should.equal(0)
    }).then(function() {
      return tt.snapshot('animals/dogs/chiuauas')
    }).then(function(chiuauas) {
      chiuauas.push({ name: 'Wayne' })
      return tt.put('animals/dogs/chiuauas', chiuauas)
    }).then(function(sequenceNumber) {
      sequenceNumber.should.equal(1)
      return tt.snapshot('animals/dogs/chiuauas')
    }).then(function(chiuauas1) {
      chiuauas1.length.should.equal(2)
      chiuauas1[1].name.should.equal('Wayne')
    }).then(function() {
      return tt.snapshot('animals/dogs/chiuauas', 0)
    }).then(function(chiuauas0) {
      chiuauas0.length.should.equal(1)
    })
    .done(done)
  })


  it('should stream changes to watchers', function(done) {

    var dogsStreamed = undefined;
    tt.stream('animals/dogs').onChange(function(dogs) {
      dogsStreamed = dogs
    })
    var animalsStreamed = undefined;
    tt.stream('animals').onChange(function(animals) {
      animalsStreamed = animals
    })
    var rootStreamed = undefined;
    tt.stream('').onChange(function(root) {
      rootStreamed = root
    })

    tt.put('animals/cats', [{ name: 'Mittens' }]).then(function() {
      expect(dogsStreamed).to.be.null
    }).then(function() {
      return tt.put('animals/dogs', [{ name: 'Karo' }])
    }).then(function() {
      console.log("rootStreamed", rootStreamed)
      rootStreamed.animals.dogs[0].name.should.equal('Karo')
      dogsStreamed[0].name.should.equal('Karo')
      dogsStreamed = null
      return tt.put('animals/dogs', [{ name: 'Karo' }]) //same as before
    }).then(function() {
      expect(dogsStreamed).to.be.null // was unchanged, therefore not strean
      return tt.remove('animals/dogs')
    }).then(function() {
      expect(animalsStreamed.dogs).to.not.exist
      animalsStreamed.cats[0].name.should.equal('Mittens')
    })
    .done(done)
  })


})




