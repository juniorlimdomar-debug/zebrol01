# Zebrol — pacote offline

## O que foi preparado

- Abrir o aplicativo sem conexão após o primeiro carregamento completo online.
- Pesquisar os textos das pessoas e veículos já carregados por esta conta.
- Guardar miniaturas conforme elas aparecem, com limpeza das mais antigas ao atingir aproximadamente 20 MiB de conteúdo de miniaturas. O cálculo usa dois bytes por caractere para ser conservador; o navegador também usa espaço interno adicional.
- Usar a miniatura ao abrir um cadastro sem sinal; fotos maiores são buscadas online e não são gravadas no banco local de consulta.
- Criar pessoas e veículos offline, incluindo a foto comprimida e o vínculo ao proprietário.
- Mostrar apenas um “!” vermelho no canto inferior direito do card pendente. O símbolo some quando o servidor confirma o cadastro e suas fotos na mesma transação.
- Retomar tentativas automaticamente com o aplicativo aberto, ao recuperar conexão, ao voltar para o aplicativo e periodicamente enquanto estiver visível.

Fotos de cadastros pendentes são uma exceção: ficam guardadas até a confirmação do envio e não são removidas pela limpeza das miniaturas. Depois da confirmação, a foto grande sai da fila local; a miniatura pode permanecer no cache.

Não foi implementado envio com o aplicativo totalmente fechado. Nessa situação, o envio retoma quando você abre o app com conexão. Edição, exclusão, conversão de fotos antigas e alteração de alerta geral precisam de conexão. Cadastros pendentes aguardam sincronização antes de serem editados ou excluídos.

## Como publicar

Este pacote precisa de TODOS os arquivos; não basta copiar o HTML.

1. Guarde uma cópia dos arquivos atuais do repositório.
2. Coloque o conteúdo desta pasta na mesma pasta publicada pela Vercel, mantendo a estrutura abaixo. O `index.html` substitui a página principal.
3. Preserve configurações já existentes da Vercel e os demais arquivos do projeto. Nenhuma configuração de hospedagem foi alterada neste pacote.
4. Aguarde a publicação e abra o endereço HTTPS definitivo, sempre no mesmo navegador ou instalação. Endereços de prévia, arquivo local e domínio definitivo têm armazenamentos diferentes.
5. Entre com sua conta ainda online, aguarde o carregamento e role a lista para guardar as miniaturas desejadas. Espere terminar o carregamento da página antes de fechar.

Estrutura:

```
index.html
offline-store.js
offline-register.js
sw.js
manifest.webmanifest
icon-192.png
icon-512.png
vendor/
  react.js
  react-dom.js
  babel.js
  tailwind.js
  firebase-app.js
  firebase-auth.js
  firebase-firestore.js
```

As bibliotecas foram incluídas localmente para a abertura offline. O aplicativo continua usando React, Babel e Tailwind no navegador; não foi feita a conversão para uma compilação de produção. Os arquivos básicos ocupam aproximadamente 5 MB descompactados, além de textos, miniaturas, informações internas do navegador e fotos pendentes. Portanto, 20 MiB não é um limite total do aplicativo.

As regras de Firebase anteriormente usadas para `/users/{uid}/items/{id}` e suas fotos continuam sendo utilizadas. O pacote não altera regras, permissões, contas nem cria acesso compartilhado. Não foi executada nenhuma gravação no seu banco durante a preparação.

## Teste antes de distribuir

1. Abra o site publicado online e entre na conta. Veja algumas miniaturas.
2. Ative modo avião, feche o app e abra novamente pelo mesmo endereço ou ícone. Confirme a lista e a pesquisa.
3. Abra um cadastro cuja miniatura foi exibida. Sem internet, deve usar essa miniatura. Fotos não carregadas podem ficar vazias, mas os textos devem continuar acessíveis.
4. Cadastre uma pessoa fictícia com foto. O formulário deve fechar e o card deve mostrar “!” vermelho.
5. Feche e reabra ainda offline. Confirme que o cadastro e a foto pendente continuam disponíveis.
6. Cadastre um veículo fictício e selecione essa pessoa como proprietária. Confira o vínculo nos detalhes dela.
7. Restabeleça a conexão e mantenha o app aberto. O “!” só deve desaparecer após a confirmação do servidor. Dependendo da ordem de envio, o veículo pode precisar de uma tentativa adicional após o proprietário.
8. Reabra e confira os dois registros. Se possível, confira também em outro aparelho online com a mesma conta, para confirmar que não há duplicações.
9. Se o “!” permanecer, toque nele para consultar o erro e tentar novamente quando online.

## Cuidados com dados locais

É necessário ter entrado nessa conta online anteriormente. Não há autenticação nova offline. As cópias locais são separadas por conta, mas o aparelho deve ser tratado como contendo dados dos cadastros.

Limpar dados do site, usar navegação privada, trocar de domínio/navegador ou a remoção de armazenamento pelo sistema pode impedir a consulta offline ou apagar registros que não foram enviados. O app solicita armazenamento persistente quando possível, mas o navegador não é obrigado a concedê-lo. Falhas de espaço são mostradas sem fechar o formulário nem declarar sucesso.

Não exclua dados locais nem volte à versão antiga enquanto existirem cards com “!”. A versão antiga não sabe ler a fila offline. Uma cópia offline também não recebe exclusões ou mudanças feitas por outras pessoas até se reconectar.

## Atualizações posteriores

O service worker usa um pacote versionado para não misturar arquivos de versões diferentes. Em uma atualização futura dos arquivos do app, altere também a versão da constante `CACHE` em `sw.js` (por exemplo, de `zebrol-shell-offline-v1` para `zebrol-shell-offline-v2`) e publique o conjunto completo. Feche todas as abas/janelas do app e reabra online para ativar a atualização. O banco local e a fila são preservados entre versões; não renomeie esse banco sem migração.

## Verificações feitas

Passaram a compilação do JSX e os testes automatizados de armazenamento local, retomada após nova conexão ao banco, isolamento por conta, falha de gravação, limite de miniaturas, pendências protegidas, confirmação tardia, envio repetido sem duplicar, vínculo pessoa/veículo e seleção dos arquivos guardados pelo service worker.

Esses testes usam IndexedDB simulado e Firebase simulado. Ainda falta testar a abertura offline, a apresentação no celular e a sincronização contra o Firebase real no domínio publicado. Nada foi publicado automaticamente.
