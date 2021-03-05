let ph = require('path')
let fs = require('fs')

function Skin (dir) {
  this.dir = dir
  this.ini = Skin.parse(ph.join(dir, 'skin.ini'), 1)

  Object.defineProperty(this, 'root', {
    enumerable: false,
    value: fs.readdirSync(dir)
  })
}

Skin.FRAMES = /\(-?n\)/
Skin.PREFIX = /<(.+)>/

Skin.prototype.get = function (file) {
  let type = Skin.FILES.find(x => x.files.includes(file))
  let frames = file.match(Skin.FRAMES)
  if (frames) file = file.replace(frames[0], '')
  let dynamic = file.match(Skin.PREFIX)
  if (dynamic) {
    let ini = this.ini.Fonts || Skin.DEFAULT.Fonts
    let font = ini[dynamic[1]]
    if (font) file = file.replace(dynamic[0], font)
  }
  if (type) {
    for (let ext of type.extensions) {
      let match = new RegExp(`^${file}${frames ? frames[0].indexOf('-') >= 0 ? '(-\\d+)?' : '(\\d+)?' : ''}(@2x)?\\.${ext}`, 'i')
      let m = this.root.filter(x => x.match(match))
      if (m.length) return m.map(x => ph.join(this.dir, x))
      else if (file.indexOf('/') >= 0) {
        let path = ph.join(this.dir, file + '.' + ext)
        if (fs.existsSync(path)) return [path]
      }
    }
  }
  return []
}

Skin.load = (dir) => {
  Skin.DEFAULT = Skin.parse(ph.join(dir, 'default.ini'), 1) || {}
  Skin.SECTIONS = Skin.parse(ph.join(dir, 'sections.ini'), 2) || {}
  let EXTENSIONS = Skin.parse(ph.join(dir, 'extensions.ini'), 2) || {}
  Skin.FILES = Object.keys(EXTENSIONS).reduce((arr, ext) => {
    let res = { extensions: ext.split('|'), files: [] }
    for (let key of EXTENSIONS[ext]) {
      if (key.endsWith('/')) {
        let keys = Object.keys(Skin.SECTIONS).filter(x => x.startsWith(key))
        let files = [].concat.apply([], keys.map(x => Skin.SECTIONS[x]))
        res.files.push(...files)
      } else res.files.push(key)
    }
    arr.push(res)
    return arr
  }, [])
}

Skin.parse = (file, mode = 0) => {
  // Modes > 0: config, 1: skin, 2: array
  if (!fs.existsSync(file)) return null
  file = fs.readFileSync(file, 'utf-8')
  let lines = (mode === 1) ? file.replace(/\/\/.*/g, '') : file.replace(/[#;].*/g, '')
  lines = lines.split(/\r?\n/)
  let res = {}
  let mutate = false
  let key = null
  let dex = 0
  let name = ['Mania', '']
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim()
    if (!line) continue
    if (line[0] === '[' && line.slice(-1) === ']') {
      if (key === name[mode - 1]) dex++
      key = line.slice(1, -1)
      if (key === name[mode - 1] && res[key]) continue
      res[key] = (mode === 2 || (mode === 1 && key === name[0])) ? [] : {}
    } else if (key !== null) {
      let parts = line.split(':')
      if (mode === 2) {
        if (key === name[1]) {
          if (!res[key][dex]) res[key][dex] = []
          res[key][dex].push(parts[0].trim())
        } else res[key].push(parts[0].trim())
      } else if (mode === 1 && key === name[0]) {
        if (parts[0] === 'Keys' && parts[1].trim() === '') mutate = true
        if (!res[key][dex]) res[key][dex] = {}
        res[key][dex][parts.shift().trim()] = parts.join(':').trim()
      } else res[key][parts.shift().trim()] = parts.join(':').trim()
    }
  }
  if (mutate) {
    for (let i = 1; i <= 18; i++) {
      if (i > 10) i++
      let man = Object.assign({}, res.Mania[0])
      man.Keys = i.toString()
      res.Mania.push(man)
    }
    res.Mania.shift()
  }
  if (mode === 1 && res.General && res.General.HitCircleOverlayAboveNumer) {
    delete Object.assign(res.General, { HitCircleOverlayAboveNumber: res.General.HitCircleOverlayAboveNumer }).HitCircleOverlayAboveNumer
  }
  return res
}

Skin.encode = (obj) => {
  let res = []
  for (let key in obj) {
    res.push(`[${key}]`)
    for (let item in obj[key]) {
      if (obj[key][item] !== undefined) res.push(`${item}: ${obj[key][item]}`)
    }
  }
  return res.join('\n')
}

module.exports = Skin
