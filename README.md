# Escritório Virtual

Um escritório virtual em pixel art, no estilo do Gather: você faz login, monta seu
personagem, anda pelo mapa e **a chamada de áudio/vídeo começa sozinha quando você
chega perto das pessoas**. Dentro das salas fechadas, todo mundo que está lá conversa junto.

- **Login com personagem salvo** — o visual que você montar volta no próximo acesso, com histórico das versões anteriores.
- **Criador de personagem** — 3 tipos de corpo, 8 cortes de cabelo, 8 roupas, óculos/máscaras/barba, chapéus e fones, paletas de cor livres.
- **Áudio por proximidade** no open space: o volume cai com a distância e some a ~7 tiles.
- **Salas** — quem entra na sala entra na chamada daquela sala, isolada do resto.
- **Centro de configuração** — editor visual do mapa: pinta móveis, cria salas, define entradas, valida e publica ao vivo para todos.
- **Mesh WebRTC ponto a ponto** — o servidor só faz sinalização; a mídia não passa por ele.
- **Chat** global ou por sala, lista de pessoas, minimapa, compartilhamento de tela e indicador de quem está falando.
- Arte 100% desenhada por código: nenhuma imagem externa, nenhum build step.

## Rodando

```bash
npm install
npm start
```

Abra `http://localhost:3000`. Para testar com várias pessoas na mesma máquina,
use abas anônimas ou outros navegadores.

| comando | o que faz |
| --- | --- |
| `npm start` | sobe o servidor |
| `npm run dev` | sobe com reload automático |
| `npm test` | testes de servidor: sessão multiplayer, contas e editor de mapa |
| `npm run check` | valida as plantas e roda o cliente inteiro num canvas simulado |
| `npm run check:web -- <url> [--conta=nome] [--editor]` | carrega a página real num DOM completo e faz login, cria personagem, entra e abre o editor |
| `npm run build:map` | regera a planta padrão em `data/office.default.json` |
| `npm run preview -- saida.png` | renderiza a arte (mapa + personagens) em PNG, sem navegador |

Variáveis: `PORT` (3000), `HOST` (0.0.0.0), `MAX_PLAYERS` (60), `DATA_DIR` (`./data`),
`EDITOR_KEY` (protege a edição do mapa por chave).

## Contas e personagem

Na primeira tela dá para **entrar**, **criar conta** ou **entrar como visitante**.

- O usuário pode ser um **e-mail** (ex.: `teste@teste.com`) ou um apelido simples; maiúsculas são normalizadas.
- Entrando com e-mail, o nome exibido no mapa vem da parte antes do arroba — dá para trocar no criador.
- A senha aceita **apenas letras e números**, sem exigência de tamanho mínimo.
- A senha é guardada com scrypt + sal por usuário (nunca em texto puro).
- A sessão é um token assinado com HMAC, válido por 30 dias e guardado no navegador — sobrevive a restart do servidor.
- Ao entrar no escritório, o personagem é salvo na conta. Trocar de visual empurra o anterior para o **histórico** (últimos 20), e no criador dá para clicar em qualquer versão antiga para usá-la de novo.
- Visitante não salva nada e não pode editar a planta do escritório.

Tudo fica em `data/users.json` (fora do git).

## Centro de configuração (editor do mapa)

Botão **Editar** no rodapé, ou tecla `E`.

- **Ferramentas**: pincel (`B`), retângulo (`R`), balde (`G`), conta-gotas (`I`), sala (`O`), entrada (`N`).
- **32 peças**: pisos, paredes, janelas, portas, mesas, cadeiras, sofás, estantes, plantas, máquina de café, arcade, ping-pong e por aí.
- **Salas**: arraste com a ferramenta *Sala* para criar uma zona de áudio; dá para renomear, trocar o piso, a cor e o ponto de chegada.
- **Mesas de trabalho**: seguem a estrutura do Gather — a mesa é uma peça de **3 quadrados** (`[` ponta esquerda, `=` meio, `]` ponta direita) e a estação inteira é um bloco de **3x3**: a fileira da mesa, a fileira da cadeira e uma fileira livre para circular. Use as três peças em sequência para o tampo emendar.
- **Entradas**: onde as pessoas nascem ao entrar.
- Botão direito arrasta o mapa, roda do mouse dá zoom, `Ctrl+Z` / `Ctrl+Shift+Z` desfazem e refazem.
- O painel de **verificação** roda ao vivo: mapa sem buraco na borda, salas alcançáveis a pé, pontos de chegada válidos. Só dá para publicar se estiver tudo certo.
- **Publicar** grava em `data/office.json` e todo mundo que está online recebe a planta nova na hora — quem estiver em cima de um obstáculo novo é empurrado para o tile livre mais próximo.
- **Restaurar padrão** volta para `data/office.default.json`.

Por padrão qualquer pessoa **com conta** pode publicar. Com `EDITOR_KEY` definida,
só quem mandar a chave edita.

## Usando com o time

Navegadores só liberam câmera e microfone em `localhost` **ou** em HTTPS.

**Tailscale (recomendado, sem expor nada na internet):**

```bash
tailscale serve --bg --https=443 http://localhost:3000
# desligar depois:
tailscale serve --https=443 off
```

Isso publica em `https://<sua-maquina>.<tailnet>.ts.net` com certificado válido,
acessível só para quem está no seu tailnet.

**Certificado próprio:** coloque `certs/key.pem` e `certs/cert.pem` que o servidor
sobe em HTTPS sozinho.

**Túnel público:** `cloudflared tunnel --url http://localhost:3000`.

> **NAT e firewall:** o mesh usa só servidores STUN públicos. Em redes muito
> restritivas alguma conexão pode não fechar; nesse caso adicione um TURN próprio
> em `ICE.iceServers`, em `public/js/rtc.js`.

## Controles

| tecla | ação |
| --- | --- |
| `W A S D` / setas | andar |
| `Enter` | abrir o chat |
| `M` / `C` | microfone / câmera |
| `E` | centro de configuração |
| `Tab` | mostrar / esconder o painel |
| `+` / `-` | zoom |

## Como funciona

```
navegador A  <--- WebRTC (áudio/vídeo direto) --->  navegador B
     \                                                  /
      \------- socket.io: posições, chat, offers -------/
                          server.js
                             |
                     data/  office.json
                            users.json
```

| arquivo | papel |
| --- | --- |
| `server.js` | estado dos jogadores, chat, sinalização, API de mapa e de contas |
| `lib/accounts.js` | contas, senhas, sessão e histórico de personagens |
| `public/js/tiles.js` | catálogo das peças (arte, colisão, editor e validação leem daqui) |
| `public/js/mapcheck.js` | validação do mapa, compartilhada por servidor, editor e scripts |
| `public/js/world.js` | mapa em memória, colisão e salas |
| `public/js/sprites.js` | pixel art dos tiles, sombras de contato e variação |
| `public/js/avatar.js` | personagem em camadas: corpo, roupa, cabelo, rosto, acessórios |
| `public/js/auth.js` / `creator.js` | tela de login e criador de personagem |
| `public/js/game.js` | loop, câmera, render e a regra de quem ouve quem |
| `public/js/rtc.js` | mesh WebRTC com *perfect negotiation* e volume por distância |
| `public/js/editor.js` | centro de configuração |
| `public/js/ui.js` / `net.js` / `main.js` | HUD, socket.io e a amarração |

Ajustes de "sensação" ficam no topo de `public/js/game.js`: `SPEED`,
`NEAR_TILES` (raio de volume cheio) e `FAR_TILES` (silêncio).

### Vendo a arte sem abrir o navegador

`npm run preview -- arte.png` rasteriza os sprites e gera um PNG com um pedaço do
mapa e uma vitrine de personagens. Como toda a arte é `fillRect` de cor sólida, o
resultado é igual ao que o Chrome desenha — dá para revisar mudança de arte em
diff, ou no CI.

## Limites conhecidos

- O mesh é P2P: acima de ~8 pessoas **na mesma chamada** o consumo de CPU e banda cresce rápido. Para grupos maiores o caminho é uma SFU (mediasoup, LiveKit).
- Posições e presença vivem na memória do processo; contas e mapa ficam em disco.
- O login é simples de propósito (sem e-mail, recuperação de senha ou 2FA). Serve para separar personagens dentro de uma rede confiável, não como identidade corporativa — mantenha atrás da VPN.
