# Simple Vlog Editor — plugin para Codex

Plugin que conecta o Codex ao **SimpleVlogEditor instalado no Windows**, abre a
janela do editor e disponibiliza suas ferramentas de edição através de MCP.

## Requisitos

- Windows x64.
- Node.js 18 ou superior disponível no PATH (`node --version`).
- Codex com suporte a plugins.
- SimpleVlogEditor 1.1.3 ou superior instalado pelo
  [instalador oficial](https://simplevlogeditor.com/), na pasta padrão.

O plugin encontra a instalação em `Program Files\SimpleVlogEditor` ou em
`%LOCALAPPDATA%\Programs\SimpleVlogEditor`. O usuário não precisa do código-fonte
do editor nem instalar dependências do Electron ou compilar o projeto web.

## Instalar a partir do GitHub

Depois de publicar este repositório, execute no PowerShell:

```powershell
$pluginRepository = Read-Host 'Cole a URL do repositorio GitHub deste plugin'
codex plugin marketplace add $pluginRepository
codex plugin add simple-vlog-editor@simple-vlog-editor
```

Abra uma nova tarefa no Codex para carregar o plugin. Peça, por exemplo:
“Use o Simple Vlog Editor para abrir o editor instalado e verificar seu estado.”

O marketplace se chama `simple-vlog-editor`; o plugin também se chama
`simple-vlog-editor`. A instalação do marketplace deve preceder a do plugin.

## Instalar a partir de uma cópia local

Abra o PowerShell na raiz deste repositório e execute:

```powershell
powershell.exe -NoProfile -File .\install.ps1
```

O instalador registra o marketplace **e instala o plugin**, confirma que ele está
habilitado e encontra também o Codex CLI incluído no aplicativo desktop.
Para conferir a ação sem instalar, acrescente `-WhatIf`.
Ele altera apenas o registro deste marketplace e a instalação deste plugin no Codex.

Se o comando `codex` já está disponível, o equivalente manual é:

```powershell
codex plugin marketplace add .
codex plugin add simple-vlog-editor@simple-vlog-editor
```

Abra uma nova tarefa após instalar.

**Adicionar somente o marketplace não instala o plugin.** No aplicativo Codex,
abra Plugins, escolha o marketplace Simple Vlog Editor e clique em instalar no
plugin. Depois, selecione o plugin em uma nova tarefa e peça para abrir o editor.
O nome completo desta distribuição é `simple-vlog-editor@simple-vlog-editor`;
`simple-vlog-editor@personal` pertence a outra distribuição e não a substitui.

## Conferir a conexão com o editor

Na raiz deste repositório:

```powershell
node ./plugins/simple-vlog-editor/scripts/doctor.mjs --no-launch
node ./plugins/simple-vlog-editor/scripts/doctor.mjs
```

O primeiro comando confere os arquivos e a instalação. O segundo estabelece uma
sessão MCP real, verifica as ferramentas e abre ou reutiliza a janela do editor.
O diagnóstico usa o comando e o diretório de `.mcp.json`, repassando somente as
variáveis de ambiente declaradas ali, inclusive as pastas de instalação do Windows.
Não é necessário executar `npm install`.

## Estrutura do repositório

```text
.agents/plugins/marketplace.json
.gitattributes
.gitignore
README.md
install.ps1
plugins/simple-vlog-editor/
  .codex-plugin/plugin.json
  .mcp.json
  README.md
  scripts/
  skills/edit-video/
  skills/edit-vlog/
```

O marketplace aponta para `./plugins/simple-vlog-editor`, um caminho relativo à
raiz deste repositório. Os scripts e as skills estão incluídos no próprio plugin.

## Publicar este diretório

Use **o conteúdo deste diretório como a raiz do novo repositório GitHub**.
Inclua as pastas e os arquivos que começam com ponto, especialmente `.agents`,
`.codex-plugin` e `.mcp.json`. A pasta `github` não deve ficar dentro de outra
pasta no repositório publicado.

Este diretório contém os arquivos para versionar. Crie o repositório Git aqui,
faça o primeiro commit e envie-o ao GitHub com a conta e o nome que escolher.
O aplicativo instalado, arquivos de mídia, caches e ZIPs não fazem parte do plugin.

## Atualizações

As alterações distribuídas devem estar dentro de `plugins/simple-vlog-editor`.
Mantenha o manifesto e os scripts juntos ao publicar uma nova versão. O ZIP
usado na distribuição manual não é necessário para a instalação via GitHub.

O build do site empacota `plugins/simple-vlog-editor` deste diretório no ZIP de
download. Este README descreve a instalação pelo marketplace; o README dentro
do plugin acompanha a cópia distribuída no ZIP.

Consulte também a [documentação do plugin](plugins/simple-vlog-editor/README.md).
