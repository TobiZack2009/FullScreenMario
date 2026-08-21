// audio.js — Vite ES module for sound loading + playback
// Merges former sounds.js + load.js audio functions.
// Uses import.meta.glob for Vite-resolved asset URLs.
// All cross-file globals use window. prefix (strict mode).

// --- Vite-resolved sound URLs ---

var sfxUrls = {};
var sfxGlob = import.meta.glob('../Sounds/ogg/*.ogg', { eager: true, query: '?url', import: 'default' });
for (var path in sfxGlob) {
  sfxUrls[path.split('/').pop().replace('.ogg', '')] = sfxGlob[path];
}

var themeUrls = {};
var themeGlob = import.meta.glob('../Sounds/Themes/ogg/*.ogg', { eager: true, query: '?url', import: 'default' });
for (var path in themeGlob) {
  themeUrls[path.split('/').pop().replace('.ogg', '')] = themeGlob[path];
}


// --- Sound loading ---

function startLoadingSounds() {
  var libsounds = window.library.sounds;
  setTimeout(function() { loadSounds(libsounds, window.library.sounds.names, sfxUrls); }, 7);
  setTimeout(function() { loadSounds(libsounds, window.library.sounds.themes, themeUrls); }, 14);
}

function loadSounds(container, reference, urlMap) {
  var sound, name_raw,
      details = {
          preload: 'auto',
          prefix: '',
          used: 0
        },
      len, i;
  for (i = 0, len = reference.length; i < len; ++i) {
    name_raw = reference[i];

    sound = window.createElement("Audio", details);
    container[name_raw] = sound;
    window.mlog("Sounds", sound);

    sound.appendChild(window.createElement("Source", {
      type: "audio/ogg",
      src: urlMap[name_raw]
    }));

    sound.volume = 0;
    sound.play();
  }
}


// --- Playback ---

function resetSounds() {
  window.sounds = {};
  window.theme = false;
  window.muted = (localStorage && localStorage.muted == "true");
}

function play(name_raw) {
  var sound = window.sounds[name_raw];

  if (!sound) {
    if (sound = window.library.sounds[name_raw]) {
      window.sounds[name_raw] = sound;
    } else {
      window.log("Unknown sound: '" + name_raw + "'");
      return sound;
    }
  }

  if (sound.readyState) {
    sound.pause();
    sound.currentTime = 0;
  }
  sound.volume = !window.muted;
  sound.play();

  if (!(sound.used++)) sound.addEventListener("ended", function() {
    window.mlog("Sounds", sound);
    soundFinish(sound, name_raw);
  });

  return sound;
}

function playLocal(name, xloc, main) {
  var sound = play(name, main),
      volume_real;
  if (!sound || !window.mario) return;

  if (window.muted || xloc < 0 || xloc > window.gamescreen.unitwidth) volume_real = 0;
  else volume_real = Math.max(.14, Math.min(.84, 1.4 * (window.gamescreen.unitwidth - Math.abs(xloc - window.mario.left)) / window.gamescreen.unitwidth));

  sound.volume = volume_real;
  sound.volume_real = volume_real;
}

function playTheme(name_raw, resume) {
  var sound;
  if (sound = window.sounds.theme) {
    soundStop(sound);
    delete window.sounds.theme;
    delete window.sounds[sound.name_raw];
  }

  if (!name_raw) name_raw = window.area.theme;

  sound = window.sounds.theme = play(name_raw);
  sound.loop = true;

  if (sound.used == 1) sound.addEventListener("ended", playTheme);

  return sound;
}

function playCurrentThemeHurry(name_raw) {
  playTheme("Hurry " + (name_raw || window.area.theme));
}

function soundFinish(sound, name_raw) {
  if (window.sounds[name_raw]) delete window.sounds[name_raw];
}

function soundStop(sound) {
  if (sound) {
    sound.pause();
    if (sound.readyState) sound.currentTime = 0;
  }
}

function toggleMute() {
  var level = !(localStorage.muted = window.data.muted = window.muted = !window.muted);
  for (var i in window.sounds) window.sounds[i].volume = level;
}

function pauseAllSounds() { for (var i in window.sounds) if (window.sounds[i]) window.sounds[i].pause(); }
function resumeAllSounds() { for (var i in window.sounds) if (window.sounds[i]) window.sounds[i].play(); }
function pauseTheme() { if (window.sounds.theme) window.sounds.theme.pause(); }
function resumeTheme() { if (window.sounds.theme) window.sounds.theme.play(); }


// --- ES Module exports ---

Object.assign(window, {
  resetSounds, play, playLocal, playTheme, playCurrentThemeHurry, soundFinish,
  soundStop, toggleMute, pauseAllSounds, resumeAllSounds, pauseTheme,
  resumeTheme, startLoadingSounds, loadSounds
});
