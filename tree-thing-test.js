var chai = require('chai')
var expect = chai.expect
chai.should()

var TreeThing = require('./tree-thing')


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




