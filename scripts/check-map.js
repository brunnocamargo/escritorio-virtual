/**
 * Valida as plantas gravadas em data/ com as mesmas regras do servidor.
 *
 *   node scripts/check-map.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const mapcheck = require('../public/js/mapcheck.js');
const tiles = require('../public/js/tiles.js');

const arquivos = ['office.default.json', 'office.json']
  .map((nome) => path.join(__dirname, '..', 'data', nome))
  .filter((caminho) => fs.existsSync(caminho));

if (!arquivos.length) {
  console.log('Nenhuma planta em data/. Rode: node scripts/build-default-map.js');
  process.exit(1);
}

let problemas = 0;
for (const caminho of arquivos) {
  const nome = path.basename(caminho);
  let mapa;
  try {
    mapa = JSON.parse(fs.readFileSync(caminho, 'utf8'));
  } catch (err) {
    console.log('  FALHOU ' + nome + ': JSON invalido - ' + err.message);
    problemas++;
    continue;
  }

  const resultado = mapcheck.validate(mapa);
  const livres = mapa.rows.join('').split('').filter((ch) => !tiles.isSolid(ch)).length;
  console.log('');
  console.log(nome + ' - ' + mapa.name);
  console.log('  ' + mapa.rows[0].length + 'x' + mapa.rows.length + ' tiles, ' +
    (mapa.rooms || []).length + ' salas, ' + (mapa.spawns || []).length + ' entradas, ' +
    livres + ' tiles caminhaveis');
  resultado.warnings.forEach((w) => console.log('  aviso: ' + w));
  resultado.errors.forEach((e) => console.log('  ERRO: ' + e));
  if (resultado.ok) console.log('  ok');
  else problemas++;
}

console.log('');
process.exit(problemas ? 1 : 0);
