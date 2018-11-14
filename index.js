const Tree = require('tre-treeview-select')
const Str = require('tre-string')
const h = require('mutant/html-element')
const Value = require('mutant/value')
const setStyle = require('module-styles')('tre-finde')
const List = require('tre-sortable-list')

module.exports = function(ssb, opts) {
  const importer = opts.importer
  const primarySelection = opts.primarySelection || Value()
  const secondarySelections = opts.secondarySelections || Value([])
  const manualOrderKey = 'manual_order_index'
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
      const key = el.parentElement.getAttribute('data-key')
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
  
  function summary(kv) {
    return [
      h('span', kv.value.content.type),
      renderString(kv.value.content.name)
    ]
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
    const files = drop.dataTransfer.files 
    const parent_kv = drop.ctx.path.slice(-1)[0]
    const branch = parent_kv.value.content.revisionRoot || parent_kv.key
    const root = parent_kv.value.content.root || parent_kv.key
    if (files.length) {
      for(let i=0; i<files.length; ++i) {
        // jshint -W083
        importer.importFile(files[i], {}, (err, content) => {
          content = Object.assign(content, {
            [manualOrderKey]: drop.where.manual_order_index,
            branch,
            root
          })
          //console.log('import result', err, content)
          ssb.publish(content, (err, msg) => {
            console.log('imported file wrap result', err, msg)
          })
        })
      }
    }
  }

  return function(kv, ctx) {
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

