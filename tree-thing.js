var chai = require('chai')
var expect = chai.expect
chai.should()
var Q = require('q')
var forEach = require('mout/array/forEach')
var deepClone = require('mout/lang/deepClone')


// TODO: Stream
var TreeThing = {
  ensureInit: function() {
    this._changes = this._changes || []
  },
  _generateTreeFromChanges: function(until) {
    var root = {}
    forEach(this._changes, function(change, i) {
      change = deepClone(change)
      var cursor = root
      var pathPaths = change.path.split('/')
      pathPaths.forEach(function(part, i) {
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
  put: function(path, data) {
    this.ensureInit()
    this._changes.push({
      type: 'put',
      path: path,
      data: data
    })
    return Q(this._changes.length-1)
  },
  remove: function(path) {
    this.ensureInit()
    this._changes.push({
      type: 'remove',
      path: path
    })
    return Q(this._changes.length-1)
  },
  snapshot: function(path, until) {
    this.ensureInit()
    var root = this._generateTreeFromChanges(until);
    var cursor = root;
    var pathPaths = path.split('/')
    pathPaths.forEach(function(part) {
      cursor = cursor[part]
    })
    return Q(cursor)
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


})




