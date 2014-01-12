var chai = require('chai')
chai.should()
var Q = require('q')




var TreeThing = {
  ensureInit: function() {
    this._changes = this._changes || []
  },
  put: function(path, data) {
    this.ensureInit()
    this._changes.push({
      sequenceNumber: this._changes.length,
      type: 'put',
      path: path,
      data: data
    })
  },
  snapshot: function(path) {
    this.ensureInit()
    var snapshot = {}

    this._changes.forEach(function(change) {
      if (change.type === 'put') {
        var cursor = snapshot
        var pathPaths = change.path.split('/')
        pathPaths.forEach(function(part, i) {
          var isLast = i + 1 === pathPaths.length
          if (isLast)
            cursor[part] = change.data
          else
            cursor = cursor[part] = cursor[part] || {}
        })
      }
    })

    var cursor = snapshot;
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


})




