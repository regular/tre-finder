const {client} = require('tre-client')
const Finder = require('.')
const h = require('mutant/html-element')
const Value = require('mutant/value')
const setStyle = require('module-styles')('tre-finder-demo')

setStyle(`
  body {
    --tre-selection-color: green;
    --tre-secondary-selection-color: yellow;
  }
`)

client( (err, ssb, config) => {
  console.log('tre config', config.tre)
  if (err) return console.error(err)

  const sel = Value()

  const renderFinder = Finder(ssb, {
    primarySelection: sel
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
