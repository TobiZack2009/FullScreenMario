// FullScreenMario — ES Module entry point
// Imports all modules in dependency order; each self-registers on window.

import './toned.js';
import './gamepad.js';
import './utility.js';
import './data.js';
import './library.js';
import './sprites.js';
import './events.js';
import './things.js';
import './quadrants.js';
import './maps.js';
import './sounds.js';
import './generator.js';
import './load.js';
import './triggers.js';
import './editor.js';
import './upkeep.js';
import './mario.js';

// All window globals are set. Bootstrap the game.
FullScreenMario();
