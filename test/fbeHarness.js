'use strict';
const fs  = require('fs');
const path = require('path');
const vm  = require('vm');

/**
 * Me-load config.js + api.js + fbeImport.js (script global browser biasa,
 * repo ini tidak punya bundler/module system) ke satu context vm supaya
 * fungsi/const top-level-nya jadi property yang bisa dipanggil dari objek
 * yang dikembalikan. Dipakai untuk smoke-test logika murni pakai `node`
 * biasa — repo ini tidak punya test framework, jadi ini cara tercepat
 * untuk dapat verifikasi yang nyata & bisa dijalankan tanpa bikin
 * framework baru.
 */
function loadFbeContext() {
  const ctx = { console };
  vm.createContext(ctx);
  ['js/config.js', 'js/api.js', 'js/fbeImport.js'].forEach(rel => {
    const code = fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
    vm.runInContext(code, ctx, { filename: rel });
  });
  return ctx;
}

module.exports = { loadFbeContext };
