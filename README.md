# Pideias Telas

Protótipo de compartilhamento de tela P2P com WebRTC. O servidor só faz a sinalização via WebSocket; áudio e vídeo não passam por ele.

Cada sala aceita 1 transmissor e até 12 espectadores. A conexão é uma malha direta do transmissor para cada espectador, então o uso de upload aumenta conforme novas pessoas entram.

O transmissor pode encerrar a sala pelo botão **Parar transmissão**. A sala também possui chat de texto e voz P2P entre o transmissor e cada espectador; o navegador solicitará permissão para usar o microfone.

## Executar

No PowerShell, dentro desta pasta:

```powershell
npm.cmd install
npm.cmd start
```

Abra `http://localhost:3000` em duas janelas do navegador. Em uma, clique em **Iniciar Transmissão**, escolha uma tela e envie o ID da sala para a outra janela. Na outra, informe o ID e clique em **Conectar / Assistir**.

Para testar com outra pessoa fora do computador, o servidor precisa estar acessível pela internet e usar HTTPS/WSS. Em redes mais restritivas, adicione um servidor TURN além do STUN de demonstração.

## Publicação

O `netlify.toml` publica a interface em `public`. O arquivo `render.yaml` cria o servidor Node/WebSocket no Render com o endereço esperado pelo frontend: `wss://pideias-telas-signaling.onrender.com`.
