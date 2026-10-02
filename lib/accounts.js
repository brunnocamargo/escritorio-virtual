/**
 * accounts.js - contas, senhas e o personagem salvo de cada pessoa.
 *
 * Guarda tudo em data/users.json. Senha com scrypt + sal por usuario; o token
 * de sessao e assinado com HMAC (sem estado no servidor, sobrevive a restart).
 *
 * Nao e um sistema de identidade corporativo: e o suficiente para um
 * escritorio virtual atras da VPN, onde o objetivo e cada pessoa reencontrar
 * o proprio personagem.
 */
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const TOKEN_DIAS = 30;
const MAX_HISTORICO = 20;

function criarStore(dataDir) {
  const arquivo = path.join(dataDir, 'users.json');
  const segredoArquivo = path.join(dataDir, 'session-secret');

  fs.mkdirSync(dataDir, { recursive: true });

  // segredo de assinatura: gerado uma vez e reaproveitado
  let segredo;
  if (fs.existsSync(segredoArquivo)) {
    segredo = fs.readFileSync(segredoArquivo, 'utf8').trim();
  } else {
    segredo = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(segredoArquivo, segredo, { mode: 0o600 });
  }

  let db = { usuarios: {} };
  if (fs.existsSync(arquivo)) {
    try {
      db = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
      if (!db.usuarios) db.usuarios = {};
    } catch (err) {
      console.warn('[contas] users.json ilegivel, comecando vazio:', err.message);
    }
  }

  // Gravacao sincrona de proposito: o arquivo e pequeno e um perfil perdido
  // por causa de um restart no meio do caminho custa mais que o disco.
  function gravar() {
    try {
      fs.writeFileSync(arquivo, JSON.stringify(db, null, 2));
    } catch (err) {
      console.error('[contas] falha ao gravar users.json:', err.message);
    }
  }

  // ------------------------------------------------------------- utilidades ---

  const normalizarUsuario = (nome) => String(nome || '').trim().toLowerCase();

  /** Aceita um e-mail completo ou um apelido simples. */
  function usuarioValido(nome) {
    if (nome.length < 3 || nome.length > 60) return false;
    const apelido = /^[a-z0-9._-]+$/;
    const email = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/;
    return apelido.test(nome) || email.test(nome);
  }

  /** Sem regra de tamanho: a unica exigencia e serem letras e numeros. */
  function senhaValida(senha) {
    return /^[A-Za-z0-9]+$/.test(String(senha == null ? '' : senha));
  }

  /** Nome para exibir: de um e-mail, so a parte antes do arroba. */
  function nomeSugerido(usuario) {
    return String(usuario || '').split('@')[0].slice(0, 20) || 'Convidado';
  }

  function hashSenha(senha, salt) {
    return crypto.scryptSync(String(senha), salt, 64).toString('hex');
  }

  function conferirSenha(senha, registro) {
    const calculado = hashSenha(senha, registro.salt);
    const a = Buffer.from(calculado, 'hex');
    const b = Buffer.from(registro.hash, 'hex');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }

  const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');

  function assinar(payload) {
    const corpo = b64(payload);
    const assinatura = crypto.createHmac('sha256', segredo).update(corpo).digest('base64url');
    return corpo + '.' + assinatura;
  }

  function verificar(token) {
    if (typeof token !== 'string' || !token.includes('.')) return null;
    const [corpo, assinatura] = token.split('.');
    const esperado = crypto.createHmac('sha256', segredo).update(corpo).digest('base64url');
    const a = Buffer.from(assinatura || '');
    const b = Buffer.from(esperado);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    let payload;
    try {
      payload = JSON.parse(Buffer.from(corpo, 'base64url').toString('utf8'));
    } catch (err) {
      return null;
    }
    if (!payload.exp || payload.exp < Date.now()) return null;
    if (!db.usuarios[payload.u]) return null;
    return payload;
  }

  function tokenPara(usuario) {
    return assinar({ u: usuario, exp: Date.now() + TOKEN_DIAS * 24 * 3600 * 1000 });
  }

  function publico(usuario) {
    const conta = db.usuarios[usuario];
    return {
      usuario,
      perfil: conta.perfil,
      historico: conta.historico || [],
      criadoEm: conta.criadoEm,
    };
  }

  // ------------------------------------------------------------------- API ---

  function registrar(nomeBruto, senha, perfil) {
    const usuario = normalizarUsuario(nomeBruto);
    if (!usuarioValido(usuario)) {
      return {
        erro: 'Use um e-mail (ex.: teste@teste.com) ou um apelido de 3 a 60 caracteres '
          + 'com letras, numeros, ponto, hifen ou _.',
      };
    }
    if (!senhaValida(senha)) {
      return { erro: 'A senha deve usar apenas letras e numeros.' };
    }
    if (db.usuarios[usuario]) {
      return { erro: 'Ja existe alguem com esse usuario.' };
    }
    const salt = crypto.randomBytes(16).toString('hex');
    db.usuarios[usuario] = {
      criadoEm: Date.now(),
      senha: { salt, hash: hashSenha(senha, salt) },
      perfil: perfil || { nome: nomeSugerido(usuario), status: '', look: {} },
      historico: [],
    };
    gravar();
    return { token: tokenPara(usuario), conta: publico(usuario) };
  }

  function entrar(nomeBruto, senha) {
    const usuario = normalizarUsuario(nomeBruto);
    const conta = db.usuarios[usuario];
    if (!conta || !conferirSenha(senha, conta.senha)) {
      return { erro: 'Usuario ou senha nao conferem.' };
    }
    conta.ultimoAcesso = Date.now();
    gravar();
    return { token: tokenPara(usuario), conta: publico(usuario) };
  }

  /** Salva o personagem e guarda a versao anterior no historico. */
  function salvarPerfil(usuario, perfil) {
    const conta = db.usuarios[usuario];
    if (!conta) return { erro: 'Conta nao encontrada.' };

    const anterior = conta.perfil || {};
    const mudou = JSON.stringify(anterior.look || {}) !== JSON.stringify(perfil.look || {}) ||
      anterior.nome !== perfil.nome;

    if (mudou && (anterior.look || anterior.nome)) {
      conta.historico = conta.historico || [];
      conta.historico.unshift({
        em: Date.now(),
        nome: anterior.nome,
        look: anterior.look || {},
      });
      conta.historico = conta.historico.slice(0, MAX_HISTORICO);
    }

    conta.perfil = {
      nome: perfil.nome,
      status: perfil.status || '',
      look: perfil.look || {},
    };
    conta.atualizadoEm = Date.now();
    gravar();
    return { conta: publico(usuario) };
  }

  function apagarHistorico(usuario) {
    const conta = db.usuarios[usuario];
    if (!conta) return { erro: 'Conta nao encontrada.' };
    conta.historico = [];
    gravar();
    return { conta: publico(usuario) };
  }

  function total() {
    return Object.keys(db.usuarios).length;
  }

  return {
    registrar, entrar, salvarPerfil, apagarHistorico,
    verificar, publico, total, nomeSugerido, arquivo,
  };
}

module.exports = { criarStore };
