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

## Ideia de integração com um PDV

Esta versão é um protótipo de atendimento por compartilhamento de tela, voz e chat. Para transformá-la em suporte nativo dentro do PDV, um caminho possível é:

1. Adicionar no PDV um botão **Falar com suporte** que abre a tela em uma janela ou iframe.
2. O backend do PDV autentica o funcionário/loja e solicita uma sessão temporária ao serviço de suporte. O código da sessão e o contexto do chamado podem ser associados ao ticket, sem enviar senhas, dados de cartão ou informações desnecessárias.
3. O suporte recebe o chamado em um painel autenticado e entra na sala. Validar a origem e as permissões do iframe; comunicação entre o PDV e o suporte deve usar `postMessage` com origens permitidas, nunca aceitar mensagens de qualquer site.
4. Em produção, adicionar autenticação, autorização por papel, expiração e limite de sessões, registros de auditoria, política de retenção, proteção contra abuso e um servidor TURN próprio. Hoje as salas ficam apenas na memória do processo e a malha P2P aumenta o upload do transmissor a cada espectador.

Antes de usar com clientes ou dados reais, a empresa responsável pelo PDV deve revisar segurança, privacidade, LGPD, hospedagem e contrato. O protótipo atual não implementa login de atendente nem integração com chamados.

## Controle remoto do computador

O navegador permite que a pessoa compartilhe a tela depois de autorizar, mas não permite que esta página clique, digite ou controle o sistema operacional dela. Essa limitação é intencional e protege o usuário. Controle remoto real exigiria um aplicativo/agente instalado no computador, assinado e desenvolvido com permissões explícitas por sessão, confirmação visível, possibilidade de revogar a qualquer momento, escopo limitado e auditoria. Não é seguro tentar contornar as restrições do navegador.

Para começar a oferecer suporte sem desenvolver esse agente, a opção mais segura é integrar uma ferramenta de acesso remoto já auditada/aprovada pela empresa e manter este projeto para vídeo, voz e chat. Uma evolução intermediária é oferecer apenas compartilhamento de tela e orientar o usuário por voz, sem controle do mouse/teclado.
