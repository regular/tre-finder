const Tree = require('tre-treeview-select')
const Str = require('tre-string')
const h = require('mutant/html-element')
const Value = require('mutant/value')
const setStyle = require('module-styles')('tre-finde')
const List = require('tre-sortable-list')
const dropzone = require('tre-dropzone')

module.exports = function(ssb, opts) {
  opts = opts || {}
  const importer = opts.importer
  const factory = opts.factory
  const primarySelection = opts.primarySelection || Value()
  const secondarySelections = opts.secondarySelections || Value([])
  const manualOrderKey = 'manual-order-index'
  const manualOrder = opts.manualOrder || {
    get: kv => kv.value.content && kv.value.content[manualOrderKey] || 0,
    set: (kv, index, cb) => {
      patch(kv.key, {[manualOrderKey]: index}, cb)
    }
  }

  setStyle(`
    li.drag-wrap {
      list-style-type: none;
    }
    details > ul {
      padding-left: .8em;
    }
    span {
      margin-right: .4em;
    }
    span[data-key] {
      width: 100%;
    }
    span[data-key].selected {
      background-color: var(--tre-selection-color);
    }
    span[data-key].secondary-selected {
      background-color: var(--tre-secondary-selection-color);
    }
  `)

  const renderString = Str({
    canEdit: el => {
      console.log('canEdit', el)
      return ancestorHasClass(el, 'selected')
    },
    save: (text, el) => {
      const key = el.closest('[data-key]').getAttribute('data-key')
      console.log('Saving', key, text)
      ssb.revisions.patch(key, content => {
        content.name = text
        return content 
      }, (err, result)=>{
        if (err) return console.error(err)
        console.log(result)
      })
    }
  })

  function patch(key, p, cb) {
    ssb.revisions.patch(key, content => {
      return Object.assign(content, p)
    }, cb)
  }

  function createNew(parent_kv, content) {
    const parent_revRoot = parent_kv.value.content.revisionRoot || parent_kv.key
    content.branch = parent_revRoot
    content.name = 'no name yet'
    ssb.publish(content, (err, msg) => {
      if (err) return console.error(err)
      console.log('published', msg)
    })
  }
  
  function summary(kv, ctx) {
    return h('span.summary', [
      h('span.tre-dropzone', dropzone.obj({
        ctx: Object.assign({}, ctx, {
          path: ctx.path.concat(kv)
        }),
        on_drop: drop => {
          handleDrop(Object.assign({}, drop, {
            where: {preposition: 'inside', relativeTo: kv.key}
          }))
        }
      }), kv.value.content.type),
      renderString(kv.value.content.name),
      factory ?  renderFactoryMenu(kv, factory, createNew) : []
    ])
  }

  function renderFactoryMenu(parent_kv, factory, createNew) {
    const entries = factory.menu('en')
    entries.push({label: 'Cancel', type: ''})
    entries.unshift({label: 'Insert', type: ''})
    return h('select.tre-factory-menu', {
      'ev-change': e =>{
        if (e.target.value) {
          console.log('making new', e.target.value)
          const content = factory.make(e.target.value)
          createNew(parent_kv, content)
        }
        e.target.value = ''
        return false
      },
      'ev-click': e => {
        e.stopPropagation()
        e.preventDefault()
      }
    },
    entries.map( ({type, label}) => {
      return h('option', {
        value: type
      }, `${type ? 'New ' : ''}${label}`)
    }))
  }

  const renderTree = Tree(ssb, Object.assign({}, opts, {
    primarySelection,
    secondarySelections,
    summary,
    listRenderer: o => List(Object.assign({}, opts, o, {
      patch,
      manualOrder,
      on_drop: info => {
        console.log('DROP', info)
        handleDrop(info)
      }
    }))
  }))

  function handleDrop(drop) {
    console.log('handle drop', drop)
    const files = drop.dataTransfer.files 
    const parent_kv = drop.ctx.path.slice(-1)[0]
    const branch = parent_kv.value.content.revisionRoot || parent_kv.key
    const root = parent_kv.value.content.root || parent_kv.key
    if (files.length) {
      for(let i=0; i<files.length; ++i) {
        // jshint -W083
        importer.importFile(files[i], {}, (err, content) => {
          if (err) return console.error(err)
          console.log('importer returns', content)
          content = Object.assign(content, {
            branch, root
          })
          const mo = drop.where.manual_order_index
          if (mo !== undefined) {
            content[manualOrderKey] = mo
          }
          //console.log('import result', err, content)
          ssb.publish(content, (err, msg) => {
            console.log('imported file wrap result', err, msg)
          })
        })
      }
    }
  }

  return function(kv, ctx) {
    ctx = ctx || {}
    const tree = Value()
    const finder = h('div.tre-finder', tree)

    if (typeof kv === 'string') {
      ssb.revisions.get(kv, (err, kv) => {
        if (err) return tree.set(err.message)
        setTree(kv)
      })
    } else {
      setTree(kv)
    }

    function setTree(kv) {
      tree.set(renderTree(kv, ctx))
    }

    return finder
  }

}

// -- utils

function ancestorHasClass(el, cl) {
  if (el.parentElement) {
    if (el.parentElement.classList.contains(cl)) return true
    return ancestorHasClass(el.parentElement, cl)
  }
  return false
}

