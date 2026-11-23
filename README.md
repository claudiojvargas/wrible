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

## Hospedar no Render

O [`render.yaml`](render.yaml) configura um único serviço Web no plano gratuito. O mesmo serviço entrega a interface por HTTPS e sincroniza a lousa por WebSocket seguro.

1. Envie o código e o `render.yaml` para a branch que deseja publicar no GitHub.
2. No [painel do Render](https://dashboard.render.com/), escolha **New → Blueprint**.
3. Conecte o repositório, selecione a branch com o `render.yaml` e confirme o deploy. A configuração usa a raiz do repositório.
4. Quando o serviço estiver ativo, abra a URL fornecida pelo Render no tablet. No PC, abra a mesma URL com `?mode=view` no final.

O Render fornece a porta em `PORT` e verifica o serviço em `/api/health`. Depois de um período de inatividade, a primeira conexão pode demorar enquanto o serviço gratuito volta a rodar. Qualquer reinício ou suspensão que encerre o processo apaga a lousa em memória.

## Prova de conceito com WritePad

O reconhecimento fica desativado por padrão. Quando habilitado no servidor, **Converter em texto** ativa a conversão dos novos traços de caneta. Depois de uma pausa, a prévia aparece abaixo do Canvas no tablet e no PC. Acentos adicionados ao trecho em aberto geram uma nova revisão da mesma prévia. Escolha a fonte, corrija o texto no campo e selecione **Confirmar** para compartilhar a correção e iniciar um novo trecho ao voltar a escrever. **Apagar trecho** remove o texto e preserva a tinta. **Limpar** apaga a lousa e os textos.

### Motor e dicionário

Use o [código-fonte do WritePad](https://github.com/phatware/WritePad-Handwriting-Recognition-Engine/tree/d6cd5b032d679e739e427a6d03d03a6219b0dcaf), versão usada na verificação abaixo. O repositório identifica o código do motor como GPLv3 e contém `Dictionaries/Brazilian.dct` para pt-BR. O [repositório separado do SDK](https://github.com/phatware/WritePadSDK) também declara GPLv3 para o SDK e distribui DLLs, exemplos e outra cópia do dicionário. Consulte os termos da distribuição que usar, inclusive os documentos de licença do SDK. O Wrible contém o código-fonte do executável auxiliar. Os binários e dicionários são obtidos diretamente da PhatWare.

### Compilar no Windows x64

1. No Visual Studio com **Desenvolvimento para desktop com C++**, abra `UniversalRecognizer/V300/libuniversalreco.sln` do motor. Compile **Release | x64**. O projeto declara o conjunto de ferramentas v141. Instale-o ou redirecione o projeto para o conjunto instalado no Visual Studio.
2. Abra o **x64 Native Tools Command Prompt**, entre na raiz do Wrible e ajuste os caminhos para o checkout do motor e a biblioteca de importação `.lib` produzida pelo Visual Studio. Use a biblioteca da mesma compilação que gerou a DLL.

```cmd
set "WRITEPAD_SRC=C:\src\WritePad-Handwriting-Recognition-Engine"
set "WRITEPAD_IMPORT_LIB=C:\caminho\para\WritePadReco.lib"
mkdir "%TEMP%\wrible-writepad"
cl /nologo /std:c++14 /EHsc /MD /D_OS_LINUX /I"%WRITEPAD_SRC%\UniversalRecognizer\V300\include" /Fo"%TEMP%\wrible-writepad\worker.obj" /Fe"%TEMP%\wrible-writepad\writepad-worker.exe" native\writepad\worker.cpp "%WRITEPAD_IMPORT_LIB%"
```

Copie a DLL gerada pelo Visual Studio para a pasta do executável auxiliar. Em PowerShell, na raiz do Wrible, configure os caminhos absolutos antes de iniciar:

```powershell
$env:HANDWRITING_ENGINE = 'writepad'
$env:HANDWRITING_LANGUAGE = 'pt-BR'
$env:WRITEPAD_EXECUTABLE = "$env:TEMP\wrible-writepad\writepad-worker.exe"
$env:WRITEPAD_DICTIONARY = 'C:\src\WritePad-Handwriting-Recognition-Engine\Dictionaries\Brazilian.dct'
npm ci
npm run build
npm start
```

`HANDWRITING_IDLE_MS` controla a pausa (450 ms por padrão) e `WRITEPAD_TIMEOUT_MS` o tempo limite do processo por solicitação (4 s por padrão). Para desligar a conversão, remova `HANDWRITING_ENGINE` ou defina `off`. A tinta continua disponível se o processo ou dicionário falhar.

### Reproduzir os testes

No Linux, na raiz do Wrible, aponte `WRITEPAD_SRC` para o checkout do motor:

```bash
make -C "$WRITEPAD_SRC/Linux"
g++ -std=c++11 -O2 -D_OS_LINUX -I "$WRITEPAD_SRC/Linux/include" native/writepad/worker.cpp "$WRITEPAD_SRC/Linux/Lib/libWritePadLib.a" -pthread -o /tmp/wrible-writepad-worker
node native/writepad/probe.mjs /tmp/wrible-writepad-worker "$WRITEPAD_SRC/Dictionaries/English.dct" en-US "$WRITEPAD_SRC/Linux/writepadreco/sample_strokes.csv"
node native/writepad/probe.mjs /tmp/wrible-writepad-worker "$WRITEPAD_SRC/Dictionaries/Brazilian.dct" pt-BR acao
npm run build
node --test apps/server/test/recognition.cjs
```

No Linux x64, a amostra CSV em inglês do próprio motor (395 traços, 9.889 pontos) retornou texto iniciado por `this is a pen.` em 326 ms. O caso `acao` usa seis traços de referência definidos manualmente em [`probe.mjs`](native/writepad/probe.mjs), incluindo til e cedilha. A saída real do WritePad em pt-BR foi `ação` em 19 ms. Os tempos incluem iniciar o processo. A compilação do executável auxiliar no Windows e a qualidade com escrita real da S Pen ainda precisam de validação.

Para adicionar outro motor, implemente `HandwritingRecognizer` em `apps/server/src/recognition/recognizer.ts` e registre a fábrica em `apps/server/src/recognition/providers.ts`. Selecione o motor com `HANDWRITING_ENGINE`. O teste injeta outro reconhecedor pelo mesmo provedor e usa as mensagens WebSocket do gateway real para testar prévia, revisões atrasadas, correção, exclusão e falha.

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
