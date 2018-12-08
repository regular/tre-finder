const {client} = require('tre-client')
const Finder = require('.')
const h = require('mutant/html-element')
const Value = require('mutant/value')
const computed = require('mutant/computed')
const setStyle = require('module-styles')('tre-finder-demo')
const Importer = require('tre-file-importer')

setStyle(`
  body {
    --tre-selection-color: green;
    --tre-secondary-selection-color: yellow;
  }
  .tre-finder {
    max-width: 300px;
  }
`)

client( (err, ssb, config) => {
  console.log('tre config', config.tre)
  if (err) return console.error(err)

  const importer = Importer(ssb)
  importer.use(require('tre-fonts'))
  importer.use(require('tre-images'))
  
  const sel_kv = Value()
  const sel = computed(sel_kv, kv => kv && kv.key)

  const renderFinder = Finder(ssb, {
    importer,
    primarySelection: sel_kv,
    skipFirstLevel: true,
    resolve_prototypes: true
  })



  document.body.appendChild(
    h('div', [
      h('span', 'selection'),
      h('span', sel)
    ])
  )

  document.body.appendChild(
    renderFinder(config.tre.branches.root)
  )
})
