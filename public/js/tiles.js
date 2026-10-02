/**
 * tiles.js - catalogo de pecas do escritorio.
 *
 * Fonte unica da verdade: a arte (sprites.js), a colisao (world.js), a paleta
 * do editor (editor.js) e a validacao do mapa (server + scripts) leem daqui.
 * Funciona no navegador e no Node.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.VO = root.VO || {}).tiles = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // group: piso | estrutura | moveis | decoracao
  const LIST = [
    // ------------------------------------------------------------- pisos ---
    { ch: '.', name: 'Piso de madeira', group: 'piso', floor: true },
    { ch: 't', name: 'Madeira clara', group: 'piso', floor: true },
    { ch: 'c', name: 'Carpete azul', group: 'piso', floor: true },
    { ch: 'g', name: 'Carpete verde', group: 'piso', floor: true },
    { ch: 'k', name: 'Piso de cozinha', group: 'piso', floor: true },
    { ch: 'p', name: 'Concreto', group: 'piso', floor: true },
    { ch: 'o', name: 'Tapete vermelho', group: 'piso', floor: true },
    { ch: 'l', name: 'Tapete claro', group: 'piso', floor: true },
    { ch: 'j', name: 'Grama', group: 'piso', floor: true },

    // ----------------------------------------------------- area externa ---
    { ch: 'a', name: 'Asfalto', group: 'externo', floor: true },
    { ch: 'y', name: 'Faixa da rua', group: 'externo', floor: true },
    { ch: 's', name: 'Calcada', group: 'externo', floor: true },
    { ch: 'f', name: 'Canteiro de flores', group: 'externo', floor: true },
    { ch: 'u', name: 'Agua', group: 'externo', solid: true },
    { ch: 'e', name: 'Arvore', group: 'externo', solid: true },
    { ch: 'n', name: 'Arbusto', group: 'externo', solid: true },
    { ch: 'i', name: 'Banco', group: 'externo', solid: true },
    { ch: 'z', name: 'Poste de luz', group: 'externo', solid: true },

    // -------------------------------------------------------- estrutura ---
    { ch: '#', name: 'Parede', group: 'estrutura', solid: true },
    { ch: 'w', name: 'Janela', group: 'estrutura', solid: true },
    { ch: 'v', name: 'Divisoria de vidro', group: 'estrutura', solid: true },
    { ch: 'q', name: 'Quadro na parede', group: 'estrutura', solid: true },
    { ch: 'W', name: 'Lousa / telao', group: 'estrutura', solid: true },
    { ch: '+', name: 'Porta', group: 'estrutura' },

    // ----------------------------------------------------------- moveis ---
    { ch: '[', name: 'Mesa - ponta esquerda', group: 'moveis', solid: true },
    { ch: '=', name: 'Mesa - meio', group: 'moveis', solid: true },
    { ch: ']', name: 'Mesa - ponta direita', group: 'moveis', solid: true },
    { ch: 'D', name: 'Mesa avulsa', group: 'moveis', solid: true },
    { ch: 'T', name: 'Mesa', group: 'moveis', solid: true },
    { ch: 'm', name: 'Mesa redonda', group: 'moveis', solid: true },
    { ch: 'b', name: 'Bancada', group: 'moveis', solid: true },
    { ch: 'R', name: 'Recepcao', group: 'moveis', solid: true },
    { ch: 'S', name: 'Sofa', group: 'moveis', solid: true },
    { ch: 'Z', name: 'Poltrona', group: 'moveis', solid: true },
    { ch: 'B', name: 'Estante', group: 'moveis', solid: true },
    { ch: 'x', name: 'Arquivo / caixas', group: 'moveis', solid: true },
    { ch: 'H', name: 'Cadeira', group: 'moveis' },

    // ------------------------------------------------------- decoracao ---
    { ch: 'P', name: 'Planta', group: 'decoracao', solid: true },
    { ch: 'L', name: 'Luminaria', group: 'decoracao', solid: true },
    { ch: 'C', name: 'Maquina de cafe', group: 'decoracao', solid: true },
    { ch: 'V', name: 'Maquina de snacks', group: 'decoracao', solid: true },
    { ch: '~', name: 'Bebedouro', group: 'decoracao', solid: true },
    { ch: 'A', name: 'Arcade', group: 'decoracao', solid: true },
    { ch: 'M', name: 'Ping-pong', group: 'decoracao', solid: true },
  ];

  const BY_CHAR = new Map(LIST.map((t) => [t.ch, t]));
  const FLOORS = LIST.filter((t) => t.floor).map((t) => t.ch);
  const GROUPS = ['piso', 'externo', 'estrutura', 'moveis', 'decoracao'];

  const GROUP_LABEL = {
    piso: 'Pisos',
    externo: 'Area externa',
    estrutura: 'Paredes e portas',
    moveis: 'Moveis',
    decoracao: 'Decoracao',
  };

  function get(ch) {
    return BY_CHAR.get(ch) || null;
  }

  function isSolid(ch) {
    const tile = BY_CHAR.get(ch);
    return tile ? !!tile.solid : true; // caractere desconhecido vira parede
  }

  function isFloor(ch) {
    const tile = BY_CHAR.get(ch);
    return !!(tile && tile.floor);
  }

  function isKnown(ch) {
    return BY_CHAR.has(ch);
  }

  function name(ch) {
    const tile = BY_CHAR.get(ch);
    return tile ? tile.name : 'Desconhecido (' + ch + ')';
  }

  function byGroup(group) {
    return LIST.filter((t) => t.group === group);
  }

  return { LIST, GROUPS, GROUP_LABEL, FLOORS, get, isSolid, isFloor, isKnown, name, byGroup };
});
