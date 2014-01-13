var chai = require('chai')
var expect = chai.expect
chai.should()
var Q = require('q')
Q.longStackSupport = true;
var forEach = require('mout/array/forEach')
var combine = require('mout/array/combine')
var reject = require('mout/array/reject')
var deepClone = require('mout/lang/deepClone')

// Not using mouts deepEquals because we need array support.
var deepEquals = require('deep-equal')

function normalizePath(path) {
  return path.indexOf('/') == 0 ? path : '/' + path
}

function ancestor(path) {
  return normalizePath(path.split('/').slice(0, -1).join('/'))
}

function ancestry(path) {
  var arr = [ path ]
  while(arr[0] !== '/') arr.unshift(ancestor(arr[0]));
  return arr
}

// Gets an array of the path part, sans root
function chain(path) {
  return reject(path.split('/'), function(part) {
    return part === ''
  })
}

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
      var pathChain = chain(change.path)
      pathChain.forEach(function(part, i) {
        var isLast = i + 1 === pathChain.length
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

    return Q.all(
      ancestry(path).map(function(notifyPath) {
        if (!me._watchers[notifyPath] ||
             me._watchers[notifyPath].length === 0) {
          // Nothing listening on this path, don't bother
          // doing any work.
          return Q(true);
        }
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
  _change: function(type, path, data) {
    path = normalizePath(path)
    this.ensureInit()
    var before = this._changes.length - 1
    this._changes.push({
      type: type,
      path: path,
      data: data
    });
    var after = this._changes.length - 1
    return this
      ._notifyAboutChanges(path, before, after)
      .then(function() {
        return after
      })
  },
  put: function(path, data) {
    return this._change('put', path, data)
  },
  remove: function(path) {
    return this._change('remove', path)
  },
  snapshot: function(path, until) {
    path = normalizePath(path)
    if (until === -1) return Q(null);
    this.ensureInit()
    var root = this._generateTreeFromChanges(until);
    var cursor = root;
    var pathParts =chain(path)
    forEach(pathParts, function(part) {

      if (!cursor[part]) {
        // Path does not exist, just return null
        cursor = null
        return false
      }
      cursor = cursor[part]
    })

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

  it('should be possible to insert and snapshot a node (heirarchy)', function(done) {
    tt.put('animals/dogs/chiuauas', [{ name: 'Caitlin' }])
    tt.snapshot('animals/dogs').then(function(s) {
      s.chiuauas[0].name.should.equal('Caitlin')
    })
    .done(done)
  })

  it('removes nodes', function(done) {
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

  it('should be possible to snapshots old versions', function(done) {
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
    tt.stream('/animals/dogs').onChange(function(dogs) {
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




