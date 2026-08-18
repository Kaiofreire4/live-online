# Pideias Telas

Protótipo de compartilhamento de tela P2P com WebRTC. O servidor só faz a sinalização via WebSocket; áudio e vídeo não passam por ele.

## Executar

No PowerShell, dentro desta pasta:

```powershell
npm.cmd install
npm.cmd start
```

Abra `http://localhost:3000` em duas janelas do navegador. Em uma, clique em **Iniciar Transmissão**, escolha uma tela e envie o ID da sala para a outra janela. Na outra, informe o ID e clique em **Conectar / Assistir**.

Para testar com outra pessoa fora do computador, o servidor precisa estar acessível pela internet e usar HTTPS/WSS. Em redes mais restritivas, adicione um servidor TURN além do STUN de demonstração.
