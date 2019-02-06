const Tree = require('tre-treeview-select')
const Str = require('tre-string')
const h = require('mutant/html-element')
const Value = require('mutant/value')
const computed = require('mutant/computed')
const setStyle = require('module-styles')('tre-finder')
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
  
  styles()

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

  const renderTree = Tree(ssb, Object.assign({}, opts, {
    sync: true,
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

  const result = renderFinder
  result.primarySelectionObs = ignoreRevision(primarySelection)

  return result

  function renderFinder(kv, ctx) {
    ctx = ctx || {}
    const tree = Value()
    const finder = h('div.tre-finder', tree)

    if (typeof kv === 'string') {
      ssb.revisions.get(kv, {meta: true}, (err, kv) => {
        console.log('Finder root', kv)
        if (err) {
          console.error('Error getting tree root', err.message)
          tree.set(err.message)
          return
        }
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

  function move(kv, oldBranch, newBranch) {
    // TODO: check if kv is about to move into one of its children
    // and refuse to move. Otherwise, they'll vanish.
    const revRoot = revisionRoot(kv)
    console.log('Moving', revRoot, 'from', oldBranch, 'to', newBranch)
    if (revRoot == newBranch) {
      return console.log("don't move node into itself!")
    }
    if (oldBranch == newBranch) {
      return console.log('Nothing to do')
    }
    const branch = kv.value.content.branch
    const branches = Array.isArray(branch) ? branch : [branch]
    if (!branches.includes(oldBranch)) {
      return console.error('branch does not contain old branch!')
    }
    const patchedBranches = branches.filter(b => b !== oldBranch).concat(newBranch)

    patch(kv.key, {
      branch: patchedBranches.length == 1 ? patchedBranches[0] : patchedBranches
    }, (err, msg) => {
      if (err) return console.error(err.message)
      console.log('published move', msg)
    })
  }

  function handleDroppedNode(dataTransfer, where) {
    const json = dataTransfer.getData('application/json')
    if (!json) return
    let kvc
    try {
      kvc = JSON.parse(json)
    } catch(e) {
      console.warn('JSON parse error', e.message)
    }
    if (!kvc) return
    console.log('dropped kvc', kvc)
    const {ctx} = kvc
    const oldParentKv = ctx.path.slice(-1)[0]
    const oldBranch = revisionRoot(oldParentKv)
    console.log('Moved from', oldBranch, 'to', where)
    const {preposition, relativeTo} = where
    if (preposition !== 'inside') return
    const newBranch = relativeTo
    move(kvc, oldBranch, newBranch)
  }

  function handleDrop(drop) {
    console.log('handle drop', drop)
    const files = drop.dataTransfer.files 
    const parent_kv = drop.ctx.path.slice(-1)[0]
    const branch = revisionRoot(parent_kv)
    const root = parent_kv.value.content.root || parent_kv.key
    if (!files.length) {
      return handleDroppedNode(drop.dataTransfer, drop.where)
    }
    if (files.length) {
      for(let i=0; i<files.length; ++i) {
        // jshint -W083
        // we pass one file at a time, which is probably what the user intended
        // TODO: there might be situations where thisis not appropriate. For example, dropping
        // several alternative files for the same font.
        importer.importFiles(files[i], (err, content) => {
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
      opts.prolog ? opts.prolog(kv, ctx) : [],
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
      factory ?  renderFactoryMenu(kv, factory, createNew) : [],
      opts.details ? opts.details(kv, ctx) : []
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
}

// -- utils

function ancestorHasClass(el, cl) {
  if (el.parentElement) {
    if (el.parentElement.classList.contains(cl)) return true
    return ancestorHasClass(el.parentElement, cl)
  }
  return false
}

function revisionRoot(kv) {
  return kv && kv.value.content && kv.value.content.revisionRoot || kv && kv.key
}

function ignoreRevision(primarySelection) {
  let current_kv
  return computed(primarySelection, kv => {
    if (current_kv && revisionRoot(current_kv) == revisionRoot(kv)) {
      return computed.NO_CHANGE
    }
    current_kv = kv
    return kv
  })
}

function styles() {
  setStyle(`
    .tre-finder li.drag-wrap {
      list-style-type: none;
    }
    .tre-finder details > ul {
      padding-left: .8em;
    }
    .tre-finder span {
      margin-right: .4em;
    }
    .tre-finder span[data-key] {
      width: 100%;
    }
    .tre-finder span[data-key].selected {
      background-color: var(--tre-selection-color);
    }
    .tre-finder span[data-key].secondary-selected {
      background-color: var(--tre-secondary-selection-color);
    }
  `)
}
