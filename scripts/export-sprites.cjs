#!/usr/bin/env node
// export-sprites.js
// Parses FullScreenMario's compressed sprite strings into .rgba binary files.
// Uses a sandboxed eval of the game's own source to leverage its parsing functions.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const OUT = path.join(ROOT, 'export');

// ── Dimensions lookup by thing name ──────────────────────────────────────
// [spritewidth, spriteheight] in GAME UNITS (each unit = 1 tile = 8px at display res)
// For 1x export, actual pixel width/height = DIMS * (unitsize / scale) = DIMS * 2
const DIMS = {
  // characters
  Eraser:          [8, 8],
  Beetle:          [8, 8],
  BeetleShell:     [8, 8],
  Blooper:         [8, 12],
  Bowser:          [16, 16],
  BowserFire:      [12, 4],
  BrickShard:      [4, 4],
  BulletBill:      [8, 7],
  Bubble:          [2, 2],
  CheepCheep:      [8, 8],
  Coin:            [5, 7],
  FireBall:        [4, 4],
  FireFlower:      [8, 8],
  Goomba:          [8, 8],
  Hammer:          [8, 8],
  HammerBro:       [8, 12],
  Koopa:           [8, 12],
  Lakitu:          [8, 12],
  Mushroom:        [8, 8],
  Pirhana:         [8, 12],
  Podoboo:         [7, 8],
  Shell:           [8, 8],
  ShellBeetle:     [8, 8],
  Spiny:           [8, 8],
  SpinyEgg:        [7, 8],
  Star:            [7, 8],
  Vine:            [8, 8], // multiple, but top piece is 8x8

  // solids
  Axe:             [8, 8],
  Block:           [8, 8],
  Brick:           [8, 8],
  BridgeBase:      [4, 8],
  Cannon:          [8, 16],
  CastleAxe:       [8, 8],
  CastleBlock:     [8, 8],
  CastleBridge:    [8, 8],
  CastleChain:     [8, 8],
  CastleStone:     [8, 8],
  Cloud:           [8, 8],
  Coral:           [8, 8],
  DeadGoomba:      [8, 8],
  Flag:            [8, 8],
  FlagPole:        [8, 8],
  FlagTop:         [4, 4],
  Floor:           [8, 8],
  Peach:           [8, 12],
  Pipe:            [16, 8],
  PipeSide:        [8, 16],
  PipeVertical:    [16, 1],
  Platform:        [4, 8],
  Scale:           [8, 8],
  Springboard:     [8, 8],
  Stone:           [8, 8],
  Toad:            [8, 12],
  ShroomTop:       [8, 8],
  TreeTop:         [8, 8],
  WaterBlock:      [1, 1],

  // scenery
  BrickHalf:       [8, 4],
  BrickPlain:      [8, 8],
  Bush1:           [16, 8],
  Bush2:           [24, 8],
  Bush3:           [32, 8],
  CastleDoor:      [8, 20],
  CastleRailing:   [8, 8],
  CastleRailingFilled: [8, 8],
  CastleTop:       [12, 12],
  CastleWall:      [8, 48],
  Cloud1:          [16, 12],
  Cloud2:          [24, 12],
  Cloud3:          [32, 12],
  Fence:           [8, 8],
  HillLarge:       [40, 17],
  HillSmall:       [24, 9],
  PlantLarge:      [8, 23],
  PlantSmall:      [7, 15],
  Railing:         [8, 8],
  ShroomTrunk:     [8, 8],
  String:          [8, 8],
  TreeTrunk:       [8, 8],
  Water:           [8, 8],
  WaterFill:       [8, 8],
};

// ── Sandbox: evaluate game source in a mock window context ────────────────
function createSandbox() {
  const win = {
    palette: undefined,
    digitsize: undefined,
    library: undefined,
    filters: undefined,
    window: null, // self-reference
    console: console,
    alert: () => {},
    Math: Math,
    Number: Number,
    String: String,
    Array: Array,
    Object: Object,
    parseInt: parseInt,
    parseFloat: parseFloat,
    isNaN: isNaN,
    isFinite: isFinite,
    Uint8ClampedArray: Uint8ClampedArray,
    RegExp: RegExp,
    Date: Date,
    JSON: JSON,
  };
  win.window = win;

  // Provide getDigitSize (used by library.js resetLibrary)
  win.getDigitSize = function(palette) {
    return Number(String(palette.length).length);
  };

  // Provide stringOf (used by makeDigit)
  win.stringOf = function(ch, times) {
    let s = '';
    for (let i = 0; i < times; i++) s += ch;
    return s;
  };

  // Provide makeDigit
  win.makeDigit = function(num, size, fill) {
    num = String(num);
    return win.stringOf(fill || '0', Math.max(0, size - num.length)) + num;
  };

  // Provide getPaletteReferenceStarting
  win.getPaletteReferenceStarting = function(palette) {
    const output = {};
    for (let i = 0; i < palette.length; i++) {
      output[win.makeDigit(i, win.digitsize)] = win.makeDigit(i, win.digitsize);
    }
    return output;
  };

  // Provide getPaletteReference
  win.getPaletteReference = function(palette) {
    const output = {};
    const ds = win.getDigitSize(palette);
    for (let i = 0; i < palette.length; i++) {
      output[win.makeDigit(i, ds)] = win.makeDigit(palette[i], ds);
    }
    return output;
  };

  return win;
}

function evalInContext(code, sandbox) {
  const ctx = vm.createContext(sandbox);
  vm.runInContext(code, ctx, { filename: 'source.js' });
  return sandbox;
}

// ── Sprite parsing (replicates sprites.js logic) ─────────────────────────
function spriteUnravel(colors, palette, digitsize) {
  const paletteref = win_getPaletteReferenceStarting(palette, digitsize);
  let ds = digitsize;
  let ref = paletteref;
  const clength = colors.length;
  let output = '';
  let loc = 0;

  while (loc < clength) {
    switch (colors[loc]) {
      case 'x': {
        const nixloc = colors.indexOf(',', ++loc);
        const key = colors.slice(loc, loc += ds);
        const val = ref[key];
        if (val === undefined) throw new Error(`Palette ref lookup failed: key="${key}" ds=${ds} refKeys=${Object.keys(ref).slice(0,10)}`);
        const current = makeDigit(val, digitsize);
        const rep = Number(colors.slice(loc, nixloc));
        for (let r = 0; r < rep; r++) output += current;
        loc = nixloc + 1;
        break;
      }
      case 'p': {
        if (colors[++loc] === '[') {
          const nixloc = colors.indexOf(']');
          ref = win_getPaletteReference(colors.slice(loc + 1, nixloc).split(','), ds);
          loc = nixloc + 1;
          ds = 1;
        } else {
          ref = paletteref;
          ds = digitsize;
        }
        break;
      }
      default:
        output += makeDigit(ref[colors.slice(loc, loc += ds)], digitsize);
        break;
    }
  }
  return { output, digitsize };
}

function spriteExpand(colors, ds, scale) {
  let output = '';
  let i = 0;
  while (i < colors.length) {
    const current = colors.slice(i, i += ds);
    for (let j = 0; j < scale; j++) output += current;
  }
  return output;
}

function spriteGetArray(colors, ds, palette) {
  const numcolors = colors.length / ds;
  const split = colors.match(new RegExp('.{1,' + ds + '}', 'g'));
  const output = new Uint8ClampedArray(numcolors * 4);
  for (let i = 0, j = 0; i < numcolors; i++) {
    const ref = palette[Number(split[i])];
    for (let k = 0; k < 4; k++) output[j + k] = ref[k];
    j += 4;
  }
  return output;
}

function win_getPaletteReferenceStarting(palette, ds) {
  const output = {};
  for (let i = 0; i < palette.length; i++) {
    output[makeDigit(i, ds)] = makeDigit(i, ds);
  }
  return output;
}

function win_getPaletteReference(palette, ds) {
  const output = {};
  const nds = getDigitSize(palette);
  for (let i = 0; i < palette.length; i++) {
    output[makeDigit(i, nds)] = makeDigit(palette[i], nds);
  }
  return output;
}

function getDigitSize(p) {
  return Number(String(p.length).length);
}

function makeDigit(num, size, fill) {
  num = String(num);
  return stringOf(fill || '0', Math.max(0, size - num.length)) + num;
}

function stringOf(ch, times) {
  let s = '';
  for (let i = 0; i < times; i++) s += ch;
  return s;
}

// ── Apply palette filter ──────────────────────────────────────────────────
// Filter color effects (palette index → palette index):
//   Underworld:  05→18 (peach→cyan), 09→16 (brown→teal)
//   Castle:      02→04 (black→dark gray), 05→01 (peach→white), 09→03 (brown→light gray)
//   Alt:         11→01 (dark brown→white)
//   Alt2:        Castle + 13→01 (green→red), 19→08 (light blue→red)
//   smart:       14→08 (dark green→red, green Koopa shell→red shell)
//   star:        4-frame progressive cycle (one/two/three/four) for rainbow effect
function applyPaletteFilter(unraveled, filter, ds) {
  let output = '';
  for (let i = 0; i < unraveled.length; i += ds) {
    const sub = unraveled.substr(i, ds);
    output += filter[sub] || sub;
  }
  return output;
}

// ── Write .rgba file with simple header ───────────────────────────────────
function writeRgba(filepath, data, width, height) {
  // Header: "RGBA" magic, width (4 bytes LE), height (4 bytes LE)
  const header = Buffer.alloc(12);
  header.write('RGBA', 0);
  header.writeUInt32LE(width, 4);
  header.writeUInt32LE(height, 8);
  const buf = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  fs.mkdirSync(path.dirname(filepath), { recursive: true });
  fs.writeFileSync(filepath, Buffer.concat([header, buf]));
}

// ── Main ──────────────────────────────────────────────────────────────────
const win = createSandbox();

// Read and evaluate library.js to get palette, filters, and rawsprites
const librarySrc = fs.readFileSync(path.join(SRC, 'library.js'), 'utf8');

// We only need the resetLibrary function's contents, not the browser globals.
// Extract the body of resetLibrary by evaluating just the parts we need.
// Actually, let's eval the entire file but mock the globals it depends on.

// library.js needs: window (self), getDigitSize, makeDigit, palette, etc.
// These are defined in toned.js but we can provide minimal versions.

// Provide SpriteMultiple constructor
win.SpriteMultiple = function(type) {
  this.type = type;
  this.multiple = true;
};

// Provide followPath
win.followPath = function(obj, path, num) {
  if (path[num] != null && obj[path[num]] != null)
    return win.followPath(obj[path[num]], path, ++num);
  return obj;
};

// library.js uses: spriteUnravel, spriteExpand, spriteGetArray
// But it defines them via resetLibrary which calls them from window scope.
// We need to define these in the sandbox too.
// Actually, libraryParse calls spriteGetArray(spriteExpand(spriteUnravel(str)))
// which are global functions defined in sprites.js.
// Let's provide them in the sandbox.

win.spriteUnravel = function(colors) {
  return spriteUnravel(colors, win.palette, win.digitsize).output;
};

win.spriteExpand = function(colors) {
  // Uses global digitsize and scale
  return spriteExpand(colors, win.digitsize, 1); // scale=1 for base export
};

win.spriteGetArray = function(colors) {
  return spriteGetArray(colors, win.digitsize, win.palette);
};

// Apply palette filter (from sprites.js, used by library.js for filtered sprites)
win.applyPaletteFilter = function(string, filter) {
  return applyPaletteFilter(string, filter, win.digitsize);
};

// Now eval library.js — this will define resetLibrary on the window
evalInContext(librarySrc, win);

// Call resetLibrary to populate palette, filters, rawsprites
win.resetLibrary();

const palette = win.palette;
const rawsprites = win.library.rawsprites;
const filters = win.library.filters;

console.log(`Palette: ${palette.length} colors`);
console.log(`Filters: ${Object.keys(filters).join(', ')}`);

// ── Walk rawsprites tree and export each sprite ───────────────────────────
let exported = 0;
let skipped = 0;

function getDim(thingName) {
  const d = DIMS[thingName];
  if (d) return [d[0] * 2, d[1] * 2]; // game units → base pixels (unitsize/scale=2)
  return [16, 16]; // default fallback
}

function followRawPath(root, pathArr) {
  let target = root;
  for (let i = 0; i < pathArr.length; i++) {
    let p = pathArr[i];
    if (target && target[p] === undefined && p === 'Overworld' && target['normal'] !== undefined) {
      p = 'normal';
    }
    target = target?.[p];
    if (target === undefined) return undefined;
  }
  return target;
}

function applyFilterToString(rawStr, filterDef) {
  // filterDef is like ["palette", {"05": "18", ...}]
  const mapping = Array.isArray(filterDef) ? filterDef[1] : filterDef;
  const { output: unraveled, digitsize } = spriteUnravel(rawStr, palette, 2);
  const filtered = applyPaletteFilter(unraveled, mapping, digitsize);
  const expanded = spriteExpand(filtered, digitsize, 1);
  return spriteGetArray(expanded, digitsize, palette);
}

function applyFilterToObject(obj, filterDef, pathParts, category, thingName) {
  for (const key in obj) {
    const val = obj[key];
    const subPath = [...pathParts, key];
    if (typeof val === 'string') {
      try {
        const rgba = applyFilterToString(val, filterDef);
        const dim = getDim(thingName);
        const width = dim[0];
        const actualPixels = rgba.length / 4;
        const height = Math.floor(actualPixels / width);
        const filename = subPath.join('-') + '.rgba';
        const outPath = path.join(OUT, category, filename);
        writeRgba(outPath, rgba, width, Math.max(1, height || dim[1]));
        exported++;
      } catch (e) {
        console.error(`  ERROR filter: ${subPath.join('.')} — ${e.message}`);
        skipped++;
      }
    } else if (val && typeof val === 'object' && !Array.isArray(val)) {
      applyFilterToObject(val, filterDef, subPath, category, thingName);
    }
  }
}

function exportString(rawStr, outPath, thingName) {
  const dim = getDim(thingName);
  const width = dim[0];

  // Parse the raw sprite string
  const { output: unraveled, digitsize } = spriteUnravel(rawStr, palette, 2);
  const expanded = spriteExpand(unraveled, digitsize, 1);
  const rgba = spriteGetArray(expanded, digitsize, palette);

  const actualPixels = rgba.length / 4;
  const height = Math.floor(actualPixels / width);

  if (height > 0 && actualPixels === width * height) {
    writeRgba(outPath, rgba, width, height);
  } else {
    // Fallback: use actual dimensions
    writeRgba(outPath, rgba, width, Math.max(1, height || dim[1]));
  }
  exported++;
}

// Process all three categories
function processEntry(obj, pathParts, category, thingName) {
  // Handle direct strings (e.g. Eraser, BulletBill, etc.)
  if (typeof obj === 'string') {
    const filename = pathParts.join('-') + '.rgba';
    const outPath = path.join(OUT, category, filename);
    try {
      exportString(obj, outPath, thingName);
    } catch (e) {
      console.error(`  ERROR: ${pathParts.join('.')} — ${e.message}`);
      skipped++;
    }
    return;
  }

  // Handle arrays (filter / same / multiple)
  if (Array.isArray(obj)) {
    //console.log(`  ARRAY at ${pathParts.join('.')}: type=${obj[0]}`);
    const type = obj[0];
    if (type === 'filter') {
      const targetPath = obj[1];
      const filterDef = obj[2];
      try {
        const target = followRawPath(rawsprites, targetPath);
        if (typeof target === 'string') {
          const rgba = applyFilterToString(target, filterDef);
          const dim = getDim(thingName);
          const width = dim[0];
          const actualPixels = rgba.length / 4;
          const height = Math.floor(actualPixels / width);
          const filename = pathParts.join('-') + '.rgba';
          const outPath = path.join(OUT, category, filename);
          writeRgba(outPath, rgba, width, Math.max(1, height || dim[1]));
          exported++;
        } else if (target && typeof target === 'object' && !Array.isArray(target)) {
          applyFilterToObject(target, filterDef, pathParts, category, thingName);
        } else {
          console.log(`  SKIP filter on non-string: ${pathParts.join('.')} (target: ${targetPath.join('.')})`);
          skipped++;
        }
      } catch (e) {
        console.error(`  ERROR filter: ${pathParts.join('.')} — ${e.message}`);
        skipped++;
      }
    } else if (type === 'same') {
      const targetPath = obj[1];
      try {
        const target = followRawPath(rawsprites, targetPath);
        if (typeof target === 'string') {
          const filename = pathParts.join('-') + '.rgba';
          const outPath = path.join(OUT, category, filename);
          exportString(target, outPath, thingName);
        } else if (target && typeof target === 'object' && !Array.isArray(target)) {
          // same→object: recursively process with this path
          processEntry(target, pathParts, category, thingName);
        } else if (Array.isArray(target)) {
          processEntry(target, pathParts, category, thingName);
        } else {
          console.log(`  SKIP same→undefined: ${pathParts.join('.')} → ${targetPath.join('.')}`);
          skipped++;
        }
      } catch (e) {
        console.error(`  ERROR same: ${pathParts.join('.')} — ${e.message}`);
        skipped++;
      }
    } else if (type === 'multiple') {
      const refs = obj[2];
      for (const partKey in refs) {
        const partVal = refs[partKey];
        if (typeof partVal === 'string') {
          const filename = [...pathParts, partKey].join('-') + '.rgba';
          const outPath = path.join(OUT, category, filename);
          try {
            exportString(partVal, outPath, thingName);
          } catch (e) {
            console.error(`  ERROR multiple.${partKey}: ${pathParts.join('.')} — ${e.message}`);
            skipped++;
          }
        }
      }
    }
    return;
  }

  // Handle objects (recurse)
  if (obj && typeof obj === 'object' && !Array.isArray(obj) && !(obj instanceof Uint8ClampedArray)) {
    for (const key in obj) {
      const val = obj[key];
      const subPath = [...pathParts, key];
      processEntry(val, subPath, category, thingName);
    }
    return;
  }
}

// Process all three categories
for (const category of ['characters', 'solids', 'scenery']) {
  console.log(`\nProcessing ${category}...`);
  const catSprites = rawsprites[category];
  for (const thingName in catSprites) {
    processEntry(catSprites[thingName], [thingName], category, thingName);
  }
}

console.log(`\nDone! Exported: ${exported}, Skipped: ${skipped}`);
console.log(`Output: ${OUT}`);
