// index.js — Single module entry point.
// Glob-imports all classic scripts as raw strings, injects them as <script>,
// then dynamically imports ES modules, then bootstraps the game.

await import('./editor-assets.css');

var classicSources = import.meta.glob([
  './toned.js', './gamepad.js', './utility.js', './data.js',
  './library.js', './sprites.js', './events.js', './things.js',
  './quadrants.js', './maps.js', './generator.js', './triggers.js',
  './editor.js', './upkeep.js', './mario.js'
], { eager: true, query: '?raw', import: 'default' });

var classicOrder = [
  './toned.js', './gamepad.js', './utility.js', './data.js',
  './library.js', './sprites.js', './events.js', './things.js',
  './quadrants.js', './maps.js', './generator.js', './triggers.js',
  './editor.js', './upkeep.js', './mario.js'
];

for (var i = 0; i < classicOrder.length; i++) {
  var el = document.createElement('script');
  el.textContent = classicSources[classicOrder[i]];
  document.head.appendChild(el);
}

await import('./fonts.js');
await import('./audio.js');
await import('./load.js');
await import('./cheats.js');

FullScreenMario();
