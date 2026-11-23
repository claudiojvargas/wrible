# Prompt para a prova de conceito de espelhamento por WebRTC

Implemente no Wrible um modo para selecionar uma janela no PC Windows e vê-la em tela cheia no navegador de um Galaxy Tab A antigo, pela rede local. A prova de conceito deve permitir avaliar se a documentação exibida fica legível e se a rolagem acompanha o PC com atraso aceitável no aparelho.

A lousa já funciona. Mantenha o espelhamento como um modo separado no mesmo produto e repositório. Nesta etapa, capture uma janela em uma tela que o Windows já reconhece. Driver de vídeo, área de trabalho estendida, áudio e controle remoto ficam para uma etapa posterior.

## Fluxo de uso

1. No PC, abra **Transmitir tela** e clique em **Escolher janela**. Chame `navigator.mediaDevices.getDisplayMedia()` a partir desse clique e deixe o navegador apresentar o seletor nativo. Se o usuário cancelar, mantenha disponível a opção de tentar novamente.
2. Mostre o endereço que o tablet deve abrir. Quando o transmissor estiver em `localhost`, use o IPv4 de rede local do PC no endereço do tablet. Se houver mais de um endereço possível, permita identificar ou selecionar o da rede compartilhada.
3. No tablet, abra **Assistir**. Exiba o vídeo e ofereça tela cheia. Se a reprodução automática for bloqueada, mostre **Iniciar visualização**.
4. Permita que o tablet entre antes ou depois de iniciar a captura. Ao recarregar a página do tablet, conecte-o novamente à captura ativa sem pedir que o PC selecione a janela outra vez.
5. Ao encerrar pelo app ou pelo controle nativo do navegador, mostre **Transmissão encerrada** no tablet. O PC deve poder iniciar outra transmissão sem reiniciar o servidor.

## Arquitetura

- Inspecione o repositório e as instruções locais antes de editar. Reaproveite React, TypeScript, Vite, NestJS e a infraestrutura WebSocket onde fizer sentido.
- Use NestJS e WebSocket para sinalização, incluindo entrada na sessão, oferta e resposta SDP, candidatos ICE e encerramento. Envie o vídeo diretamente entre os navegadores por `RTCPeerConnection`.
- Limite a sessão a um transmissor e um espectador. Mantenha a sinalização separada dos eventos da lousa, valide as mensagens recebidas e encaminhe cada mensagem ao outro participante da sessão.
- Separe captura, conexão WebRTC e interface. Reaproveite o controle de tela cheia se for independente da lousa. Abrir o espelhamento deve funcionar sem inicializar o Canvas ou carregar o motor de escrita.
- Enfileire candidatos ICE recebidos antes de aplicar a descrição remota. Libere conexões, listeners e trilhas de captura quando a parte que os possui terminar. A saída do espectador deve liberar sua conexão e manter a captura ativa no PC para permitir o retorno.
- Use apenas a rede local e mantenha `iceServers` vazio. Se a conexão direta falhar, informe isso na interface.

## Compatibilidade e configuração

- No PC, abra o transmissor em `http://localhost` com a porta do Wrible ou em HTTPS. A captura exige um contexto seguro e o navegador trata o loopback local como confiável. Documente endereços distintos para o transmissor no PC e o espectador no tablet.
- No tablet, verifique o suporte à recepção por WebRTC, à reprodução de vídeo e à tela cheia. Mostre o recurso indisponível quando houver falha de compatibilidade e permita assistir dentro da página se o navegador recusar tela cheia.
- Comece com 720p e 15 fps como valores preferenciais da captura. Deixe-os fáceis de ajustar e use a negociação de codec do WebRTC. Registre a resolução efetivamente recebida, que pode ser diferente da solicitada.

## Critérios de aceite

- Com uma janela de documentação selecionada no Windows, o tablet exibe essa janela enquanto o usuário trabalha em outra no monitor principal.
- O tablet consegue entrar antes da captura, entrar depois, recarregar durante a transmissão e voltar a assistir mantendo a mesma captura. Cancelar o seletor permite tentar novamente. Encerrar pelo controle nativo libera a captura e deixa ambos os lados prontos para uma nova sessão.
- A lousa continua funcionando. A interface oferece uma ação para retomar a reprodução quando o navegador a bloquear e permite assistir dentro da página quando a tela cheia estiver indisponível.
- O README inclui os comandos de execução, o endereço de cada dispositivo e um roteiro para testar legibilidade, rolagem e reconexão. Para medir a latência visual, use um cronômetro com milissegundos na janela capturada e filme o PC e o tablet juntos. Compare a diferença entre os relógios visíveis no mesmo quadro do vídeo. O RTT que o WebRTC informa é uma medida distinta.
- Na entrega, informe quais fluxos foram verificados, com quais dispositivos e navegadores. Registre legibilidade, fluidez e latência do Galaxy Tab A quando houver medição no aparelho.
