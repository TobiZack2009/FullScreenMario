// fonts.js — Vite module that imports font files as ESM URLs and injects @font-face CSS

import pressStartEot from '../Fonts/pressstart2p-webfont.eot';
import pressStartWoff from '../Fonts/pressstart2p-webfont.woff';
import pressStartTtf from '../Fonts/pressstart2p-webfont.ttf';
import pressStartSvg from '../Fonts/pressstart2p-webfont.svg';
import superPlumberEot from '../Fonts/super_plumber_brothers-webfont.eot';
import superPlumberWoff from '../Fonts/super_plumber_brothers-webfont.woff';
import superPlumberTtf from '../Fonts/super_plumber_brothers-webfont.ttf';
import superPlumberSvg from '../Fonts/super_plumber_brothers-webfont.svg';

var style = document.createElement('style');
style.textContent = [
  "@font-face { font-family: 'Press Start'; src: url('" + pressStartEot + "'); src: url('" + pressStartEot + "?#iefix') format('embedded-opentype'), url('" + pressStartWoff + "') format('woff'), url('" + pressStartTtf + "') format('truetype'), url('" + pressStartSvg + "#press_start_2pregular') format('svg'); font-weight: normal; font-style: normal; }",
  "@font-face { font-family: 'Super Plumber Bros'; src: url('" + superPlumberEot + "'); src: url('" + superPlumberEot + "?#iefix') format('embedded-opentype'), url('" + superPlumberWoff + "') format('woff'), url('" + superPlumberTtf + "') format('truetype'), url('" + superPlumberSvg + "#super_plumber_brothersregular') format('svg'); font-weight: normal; font-style: normal; }"
].join("\n");
document.head.appendChild(style);
