// load.js — ES module: loads map files via Vite import.meta.glob
// Replaces former AJAX-based startLoadingMaps/passivelyLoadMap.
// Raw function bodies are imported as strings, wrapped in Function(),
// and assigned to window.WorldXY so resetMaps() picks them up.

var mapFiles = import.meta.glob('../Maps/World*.js', {
  eager: true,
  query: '?raw',
  import: 'default'
});

for (var path in mapFiles) {
  var match = path.match(/World(\d)(\d)/);
  if (match) {
    window["World" + match[1] + match[2]] = new Function(mapFiles[path]);
  }
}

function setNextLevelArr(arr) {
  if(arr[1]++ == 4) {
    ++arr[0];
    arr[1] = 1;
  }
  return arr;
}

window.setNextLevelArr = setNextLevelArr;
