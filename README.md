# Wrible

Lousa digital para desenhar no navegador de um tablet Android com S Pen e acompanhar os traços em tempo real no navegador de um PC Windows. Pode ser executada na rede local ou hospedada no Render.

## Instalação

No PC, instale o [Node.js](https://nodejs.org/) **22.12 ou superior** com npm e rode na raiz do repositório:

```powershell
npm ci
```

## Desenvolvimento

```powershell
npm run dev
```

O comando inicia o Vite na porta **5173** e o NestJS na porta **3000**. O Vite encaminha `/api` e `/ws` ao NestJS, então o tablet só precisa acessar a porta **5173**. No PC, abra `http://localhost:5173/?mode=view` para acompanhar a lousa. Na interface de desenho, o botão **Modo visualização** abre a mesma lousa em outra aba.

### Acessar pelo tablet

1. Conecte o PC e o tablet à mesma rede local. Redes de convidados podem isolar os dispositivos.
2. No PowerShell do PC, execute `ipconfig`. Encontre o **Endereço IPv4** do adaptador conectado à rede do tablet, por exemplo, `192.168.1.25`.
3. No Chrome atualizado do Android, abra `http://192.168.1.25:5173/`, substituindo o endereço pelo IP do seu PC.
4. Se o navegador não conectar, confira o IP, a porta e o perfil de rede do Windows. Em uma rede confiável com perfil **Privado**, permita a porta TCP **5173** no Firewall do Windows para a sub-rede local.

Para executar no PC, use uma rede local confiável e restrinja as portas à sub-rede local no firewall. Para acesso pela internet, use a configuração do Render abaixo.

## Executar a versão compilada

```powershell
npm run build
npm start
```

Nesse modo, o NestJS serve a aplicação e o WebSocket na porta **3000**. Use essa porta nos endereços do tablet e do PC e, se necessário, na regra de firewall.

## Monitor estendido no Windows

O Windows cria a segunda tela com um driver de vídeo virtual. O Wrible captura essa tela no PC e a exibe no navegador de outro dispositivo pela rede local. O mouse e o teclado físicos continuam controlando o Windows.

### Instalar e ativar o monitor virtual

1. Em um **Windows 10 ou 11 x64**, baixe `VDD.Control.25.7.23.zip` na [página oficial da versão avaliada](https://github.com/VirtualDrivers/Virtual-Display-Driver/releases/tag/25.7.23). O projeto [Virtual Display Driver](https://github.com/VirtualDrivers/Virtual-Display-Driver/blob/25.7.23/LICENSE) usa licença MIT. O Wrible utiliza o driver como componente externo.
2. No PowerShell, compare o SHA-256 do ZIP com o publicado no GitHub. O resultado esperado é `A701F2272E9FCF382849B24F913C6DD07597B3B1116525F2E90182F019609154`.

   ```powershell
   Get-FileHash "$env:USERPROFILE\Downloads\VDD.Control.25.7.23.zip" -Algorithm SHA256
   ```

3. Extraia o ZIP e, a partir da pasta extraída, confira as duas assinaturas. Prossiga se ambas tiverem status `Valid` e identificarem a SignPath Foundation. Mantenha a verificação de assinaturas do Windows ativa.

   ```powershell
   Get-AuthenticodeSignature -FilePath '.\VDD Control.exe', '.\SignedDrivers\x86\VDD\mttvdd.cat' |
       Select-Object Path, Status, @{Name='Signatário';Expression={$_.SignerCertificate.Subject}}
   ```

4. Abra **VDD Control.exe** e instale e habilite **Virtual Display Driver**. O nome da pasta do pacote é `x86`, mas o INF e a DLL examinados são AMD64 (x64). A configuração distribuída cria um monitor virtual. A instalação pode pedir elevação.
5. Abra **Configurações → Sistema → Tela**. Use **Identificar** para localizar a tela virtual. Selecione **Estender estes vídeos**, mantenha o monitor físico como principal e arraste a representação da tela virtual para a posição desejada. Aplique e mova uma janela para essa tela com o mouse.
6. Opcionalmente, execute `.\scripts\windows\Get-WribleDisplays.ps1` em um PowerShell aberto na sessão gráfica. O script lista os monitores ativos, suas coordenadas e o pacote de driver encontrado. A tela estendida deve ter coordenadas próprias na área de trabalho.

### Capturar e assistir

1. Na raiz do Wrible, rode `npm ci` e `npm run dev`. No navegador do PC, abra `http://localhost:5173/monitor/?mode=extend`. Na versão compilada, rode `npm run build` e `npm start` e use a porta **3000**.
2. Clique em **Escolher monitor virtual**. No seletor de compartilhamento, abra **Tela inteira**, escolha a tela virtual identificada no Windows e clique em **Compartilhar**.
3. Confira na prévia local se aparece exatamente a janela da segunda tela. Mova o mouse físico sobre ela e confirme que o cursor acompanha o conteúdo. Em seguida, clique em **Iniciar transmissão**.
4. Use o link em **Abra no dispositivo receptor** no navegador da mesma rede. O endereço termina em `/monitor/?mode=watch`. Use **Tela cheia** se quiser ampliar. O receptor depende de WebRTC e reprodução de vídeo no navegador e pode entrar antes ou depois da captura.
5. Use **Encerrar transmissão** para parar a captura e a conexão. Para remover a tela adicional, mova as janelas que deseja preservar para o monitor físico e desabilite especificamente **Virtual Display Driver** no VDD Control ou no Gerenciador de Dispositivos. Desabilitar o adaptador altera a disposição das janelas no Windows.

### Arquitetura e confirmação no Windows

O Virtual Display Driver usa o modelo [Indirect Display Driver da Microsoft](https://learn.microsoft.com/windows-hardware/drivers/display/indirect-display-driver-model-overview). O adaptador de captura no Wrible fornece o `MediaStream` à sessão existente. NestJS encaminha a sinalização pelo WebSocket e o WebRTC envia o vídeo diretamente. O receptor exibe a imagem com a proporção original, e o cursor vem da própria trilha capturada.

Quando o navegador informa o tipo da fonte, o modo estendido aceita somente **Tela inteira**. Se a captura informar que oculta o cursor parado, o Wrible pede cursor sempre visível. Se a fonte continuar reportando essa limitação, ela é recusada. Quando o navegador omite esses metadados, a conferência na prévia é necessária para identificar a tela e verificar o cursor.

Se a prévia mostrar cursor ausente ou duplicado apesar de a tela correta estar selecionada, o pacote do driver oferece a opção `HardwareCursor` em `C:\VirtualDisplayDriver\vdd_settings.xml`. Encerre a transmissão e mova as janelas para o monitor físico antes de testar a opção com o valor `false`. Recarregue o driver pelo VDD Control, confira a disposição das telas e repita o teste do cursor. Esse ajuste deve ser verificado no Windows. O Wrible usa apenas o cursor que já vier no vídeo.

Verifique na ordem abaixo:

1. **Enumeração e extensão.** Mantenha o editor de código no monitor físico. Arraste a documentação para a segunda tela e confirme a disposição em **Configurações → Sistema → Tela**.
2. **Fonte transmitida.** Coloque conteúdos visualmente diferentes nos dois monitores. Confira na prévia e no receptor se ambos mostram exclusivamente o conteúdo da tela virtual.
3. **Cenário completo.** Use o mouse e o teclado físicos do PC na segunda tela. Veja no receptor se há um único cursor sobre o alvo durante movimentos, cliques e seleção. Digite e role a documentação. Recarregue o receptor para verificar a reconexão. Encerre pelo navegador do PC, confirme a mensagem no receptor e confira que o Windows mantém a segunda tela até você desabilitar o driver.

No Linux, foram conferidos os hashes publicados dos pacotes, a arquitetura AMD64 do driver e a assinatura criptográfica do catálogo, cujo signatário é a SignPath Foundation. No Chromium, uma aba capturada de verdade foi recusada como fonte do modo estendido. Uma fonte simulada permitiu testar a prévia, a confirmação, a reconexão do receptor e o encerramento. A política de confiança do Windows, a instalação, a extensão da área de trabalho e o cenário completo acima requerem teste no PC e em um receptor.

Após `npm run build`, rode `node --import tsx --test apps/web/test/browser-capture.test.mjs apps/server/test/monitor.cjs` para testar a seleção de fonte, o tratamento de metadados do cursor e a sinalização.

## Espelhamento de janela pela rede local

O modo monitor espelha uma janela do PC Windows no navegador do Galaxy Tab A. Você pode continuar usando outra janela no PC enquanto o tablet exibe a janela escolhida.

1. Após `npm ci`, rode `npm run dev` ou execute `npm run build` e `npm start` na raiz do Wrible.
2. No PC, abra `http://localhost:5173/monitor/` em desenvolvimento ou `http://localhost:3000/monitor/` na versão compilada. O navegador requer `localhost` ou HTTPS para o seletor de captura. Em uma aba do Chrome ou Edge, clique em **Escolher janela ou tela**, selecione a fonte no seletor e clique em **Compartilhar**. Se o aplicativo ainda estiver conectando ao servidor, a captura aguarda a conexão no PC.
3. No tablet, na mesma rede Wi-Fi, abra o endereço mostrado no PC em **Abra no dispositivo receptor**, como `http://192.168.1.25:5173/monitor/?mode=watch`. Se houver várias interfaces de rede no PC, escolha a interface que corresponde ao IPv4 mostrado por `ipconfig`. Use **Iniciar visualização** se a reprodução automática estiver bloqueada e **Tela cheia** para ampliar o vídeo.
4. O tablet pode entrar antes ou depois da captura. Recarregar a página do tablet mantém a captura ativa no PC. Para encerrar, use **Encerrar transmissão** ou o controle de compartilhamento do próprio navegador.

O NestJS encaminha somente a sinalização WebSocket de um transmissor e um espectador. O vídeo usa WebRTC diretamente na rede local, com `iceServers` vazio. O modo monitor aceita loopback e IPv4 de rede local. O Render hospeda a lousa. Para usar o monitor, execute o serviço no PC. Redes de convidados, isolamento de clientes Wi-Fi ou firewall podem impedir que o tablet alcance o PC ou que os candidatos ICE estabeleçam a conexão direta.

### Verificar no Galaxy Tab A

- Selecione uma janela com documentação e confirme que o texto é legível no tablet em tela cheia. Faça uma rolagem lenta e outra rápida enquanto trabalha em outra janela no PC. Anote o navegador e a resolução indicada em **Resolução recebida**.
- Recarregue o espectador durante a captura. Confira se o vídeo volta e, em seguida, encerre pelo controle nativo do navegador do PC. O tablet deve mostrar **Transmissão encerrada**. Inicie outra captura para verificar o retorno.
- Para medir o atraso visual, exiba um cronômetro com milissegundos na janela capturada e filme PC e tablet juntos. Em vários quadros da gravação, compare o tempo do cronômetro no PC com o tempo exibido no tablet. A diferença estima o atraso de ponta a ponta. O RTT do WebRTC mede ida e volta pela rede e não inclui todo o caminho de captura, codificação e exibição.

A captura usa 1280 × 720 a 15 fps como preferência depois que o navegador entrega o vídeo. Se a fonte recusar esses valores, o aplicativo continua com a configuração escolhida pelo navegador. A janela selecionada e a negociação do vídeo determinam o que chega ao tablet. A resolução, a legibilidade e a fluidez precisam ser avaliadas no aparelho.

Depois de `npm run build`, rode `node --test apps/server/test/monitor.cjs` para verificar a sinalização, a reconexão do espectador e a separação da lousa.

## Hospedar no Render

O [`render.yaml`](render.yaml) configura um único serviço Web no plano gratuito. O mesmo serviço entrega a interface por HTTPS e sincroniza a lousa por WebSocket seguro.

1. Envie o código e o `render.yaml` para a branch que deseja publicar no GitHub.
2. No [painel do Render](https://dashboard.render.com/), escolha **New → Blueprint**.
3. Conecte o repositório, selecione a branch com o `render.yaml` e confirme o deploy. A configuração usa a raiz do repositório.
4. Quando o serviço estiver ativo, abra a URL fornecida pelo Render no tablet. No PC, abra a mesma URL com `?mode=view` no final.

O Render fornece a porta em `PORT` e verifica o serviço em `/api/health`. Depois de um período de inatividade, a primeira conexão pode demorar enquanto o serviço gratuito volta a rodar. Qualquer reinício ou suspensão que encerre o processo apaga a lousa em memória.

## Uso e limitações

- Use **Tela cheia** na edição ou na visualização para ampliar a lousa. **Sair da tela cheia** restaura a página. Se o navegador bloquear o modo nativo, a lousa ocupa a área disponível da página.
- O editor desenha na própria tela assim que recebe os movimentos da caneta. A atualização das outras telas continua sujeita à latência da rede.
- Use mouse, toque ou S Pen na área branca da lousa. A pressão altera a espessura quando o navegador reporta valores de pressão através de Pointer Events. Chrome atualizado é o navegador recomendado. Se a caneta reportar valor fixo ou se a pressão não estiver disponível, o traço terá espessura constante. A disponibilidade pode variar com o dispositivo, o Android e o navegador. No acesso por HTTP local, o aplicativo usa eventos comuns quando as amostras agrupadas do navegador estão indisponíveis.
- Cores, espessura e borracha são locais ao editor. **Desfazer** remove o último traço concluído da lousa compartilhada, inclusive marcas de borracha. **Limpar** apaga os traços para todos. A lousa mantém uma proporção de 8:5 em qualquer tela.
- Durante uma queda de conexão, a última imagem fica visível e a interface reconecta automaticamente. O servidor preserva o trecho recebido de um traço interrompido. Os movimentos feitos sem conexão não são enviados depois.
- Há uma única lousa, mantida em memória, com limite de 2.000 traços ou 100.000 pontos. Reiniciar o servidor esvazia a lousa. Qualquer pessoa com acesso ao endereço pode abrir uma aba de edição, inclusive no Render. O modo visualização é uma conveniência da interface, sem autenticação.

## Estrutura

- `apps/web` contém React, Pointer Events e a renderização imperativa em Canvas 2D.
- `apps/server` contém NestJS, o gateway WebSocket com validação de entrada e a lógica de estado em memória.
- `packages/contracts` define mensagens tipadas, geometria da lousa e limites do protocolo usados pelos dois aplicativos.

`npm run build` compila os contratos e o servidor, verifica os tipos da interface e gera o bundle do Vite.
