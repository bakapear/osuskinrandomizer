process.chdir(__dirname)
let fs = require('fs')
let ph = require('path')
let mv = require('mv')
let dp = require('despair')
let Zip = require('adm-zip')
let Skin = require('./Skin')
Skin.load('data')
let TRANSPARENT = ph.join(__dirname, 'transparent.png')

process.chdir('../')
let CFG = Skin.parse('config.ini')
let DIR = CFG.Path.OsuSkinsFolder
let OUT = CFG.Path.OutputPath
let SECTIONS = CFG.Path.SectionFile

if (!fs.existsSync(DIR) || !fs.statSync(DIR).isDirectory()) {
  die(`Invalid skins folder path: '${DIR}'`)
} else if (OUT && (!fs.existsSync(OUT) || !fs.statSync(OUT).isDirectory())) {
  die(`Invalid output folder path: '${OUT}'`)
} else if (SECTIONS && (!fs.existsSync(SECTIONS) || !fs.statSync(SECTIONS).isFile())) {
  die(`Invalid sections file path: '${SECTIONS}'`)
}

SECTIONS = Skin.parse(SECTIONS, 2) || {}

function reWrite (msg) {
  process.stdout.cursorTo(0)
  process.stdout.clearLine()
  process.stdout.write(msg)
}

function die (msg) {
  console.error(msg)
  process.exit(1)
}

function rnd (max) {
  return Math.floor(Math.random() * max)
}

function rndCfg (cfg) {
  return Number(cfg) && rnd(2)
}

function findHead (obj, key) {
  for (let head in obj) {
    if (Object.hasOwnProperty.call(obj[head], key)) {
      return head
    }
  }
}

function GetValidSkins (path) {
  let skins = fs.readdirSync(path)
  let res = skins.reduce((arr, val, i) => {
    let dir = ph.join(path, val)
    if (fs.statSync(dir).isDirectory()) {
      let skin = new Skin(dir)
      if (skin.ini) {
        reWrite(`Retrieving skins... [${i + 1}/${skins.length}]`)
        arr.push(skin)
      }
    }
    return arr
  }, [])
  console.log(`\nFound ${res.length}/${skins.length} valid skins.`)
  return res
}

function ParseSections (preset, sections) {
  let total = Object.assign({}, preset)
  let apply = (section, index) => {
    let group = section[index]
    if (group.endsWith('/')) {
      let key = group.slice(0, -1)
      if (key && total[key]) section.splice(index, 1, ...total[key])
      else die(`Invalid group in section file: '${group}'`)
    }
  }
  for (let section in sections) {
    reWrite('Parsing sections...')
    let files = sections[section]
    for (let i = 0; i < files.length; i++) {
      let file = files[i]
      if (!Array.isArray(file)) apply(files, i)
      else for (let j = 0; j < file.length; j++) apply(file, j)
    }
    total[section] = files

    if (Object.keys(preset).find(x => x === section)) {
      preset[section] = files
      delete sections[section]
    }
  }
  console.log()
  return Object.assign(sections, preset)
}

async function GetRandomName () {
  let res = await dp('http://api.urbandictionary.com/v0/random').json()
  let out = {
    title: res.list[0].word,
    author: res.list[0].author
  }
  out.file = out.author + "'s " + out.title
  out.file = out.file.replace(/[^a-z0-9'(-)_[\] ]/gi, '') + '.osk'
  return out
}

async function main () {
  let SKINS = GetValidSkins(DIR)
  let sections = ParseSections(Skin.SECTIONS, SECTIONS)

  let fonts = Object.assign({}, Skin.DEFAULT.Fonts)
  let mod = { transparent: new Set(), remove: new Set() }
  let names = new Set()
  let files = []

  console.log('Getting skin elements...')
  for (let key in sections) {
    let arr = sections[key]
    if (!Array.isArray(arr[0])) arr = [arr]

    for (let section of arr) {
      let skins = SKINS.slice()
      let items = section
      while (skins.length && items.length) {
        let skin = skins.splice(rnd(skins.length), 1)[0]
        for (let index in items) {
          let item = items[index]
          if (names.has(item)) items.splice(index, 1)
          else {
            switch (key) {
              case 'Remove': {
                names.add(item)
                mod.remove.add(item)
                break
              }
              case 'Transparent': {
                names.add(item)
                mod.remove.add(item)
                mod.transparent.add(item)
                break
              }
              default: {
                if (key === 'Random' || Number(CFG.General.RandomizeAll)) skin = SKINS[rnd(SKINS.length)]
                let arr = skin.get(item)
                if (arr.length) {
                  names.add(item)
                  files.push(...arr)

                  let prefix = item.match(Skin.PREFIX)
                  if (prefix) {
                    let ini = skin.ini.Fonts || Skin.DEFAULT.Fonts
                    let overlap = prefix[1].replace('Prefix', 'Overlap')

                    fonts[prefix[1]] = ini[prefix[1]]
                    fonts[overlap] = ini[overlap]
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  console.log('Generating osk...')
  let zip = new Zip()

  for (let i = 0; i < files.length; i++) {
    let path = files[i].substr(DIR.length + 1)
    path = path.substring(path.indexOf('\\') + 1, path.lastIndexOf('\\'))
    zip.addLocalFile(files[i], path)
  }

  if (rndCfg(CFG.General.RandomCursorMiddle)) {
    mod.remove.add('cursormiddle')
  }
  if (rndCfg(CFG.General.RandomCursorTrail)) {
    mod.remove.add('cursortrail')
    mod.transparent.add('cursortrail')
  }
  if (rndCfg(CFG.General.RandomSliderEnds)) {
    mod.remove.add('sliderendcircle')
    mod.remove.add('sliderendcircleoverlay')
    mod.transparent.add('sliderendcircle')
    mod.transparent.add('sliderendcircleoverlay')
  }

  for (let item of mod.remove) {
    zip.deleteFile(item + '.png')
    zip.deleteFile(item + '@2x.png')
  }
  for (let item of mod.transparent) {
    zip.addLocalFile(TRANSPARENT, '/', item + '.png')
    zip.addLocalFile(TRANSPARENT, '/', item + '@2x.png')
  }

  let name = await GetRandomName()

  let ini = {
    General: {
      Name: name.title,
      Author: name.author,
      Version: 'latest'
    },
    Colours: {},
    Fonts: fonts
  }

  let colors = Number(CFG.General.ComboColorCount)
  if (colors === 0) colors = rnd(8) + 1

  let mode = Number(CFG.General.ColorMode)

  let skin = SKINS[rnd(SKINS.length)]

  if (mode < 2) {
    for (let i = 0; i < colors; i++) {
      ini.Colours['Combo' + (i + 1)] = `${rnd(256)},${rnd(256)},${rnd(256)}`
    }
  }
  if (mode === 0) {
    ini.Colours.SliderBall = `${rnd(256)},${rnd(256)},${rnd(256)}`
    ini.Colours.SliderBorder = `${rnd(256)},${rnd(256)},${rnd(256)}`
    ini.Colours.SliderTrackOverride = `${rnd(256)},${rnd(256)},${rnd(256)}`
  } else if (mode === 1 || mode === 3) {
    ini.Colours.SliderBall = skin.ini.Colours.SliderBall
    ini.Colours.SliderBorder = skin.ini.Colours.SliderBorder
    ini.Colours.SliderTrackOverride = skin.ini.Colours.SliderTrackOverride
  }
  if (mode === 2 || mode === 3) {
    for (let i = 0; i < 8; i++) {
      let combo = 'Combo' + (i + 1)
      if (skin.ini.Colours[combo]) ini.Colours[combo] = skin.ini.Colours[combo]
    }
  }

  for (let key in CFG.Overrides) {
    let head = findHead(Skin.DEFAULT, key)
    if (head) ini[head][key] = CFG.Overrides[key]
  }

  zip.addFile('skin.ini', Skin.encode(ini))

  zip.writeZip(name.file, err => {
    if (err) die(err)
    reWrite(`Done! >> "${ph.join(process.cwd(), name.file)}"\n`)
    let out = CFG.Path.OutputPath
    if (out) {
      out = ph.join(out, name.file)
      reWrite(`Moved to: "${out}"\n`)
      mv(name.file, out, err => {
        if (err) console.error(err)
      })
    }
  })
}

main()
