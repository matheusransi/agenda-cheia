# Agenda Cheia

Confirmação automática de consultas pelo WhatsApp para clínicas odontológicas.

- Na véspera, o paciente recebe a confirmação com os botões **Confirmar** e **Remarcar**.
- Se ele quiser remarcar, recebe os próximos horários livres e escolhe um. A agenda é atualizada sozinha.
- O horário que ficou livre é oferecido na hora para a **lista de espera**.
- Quem não responde recebe um 2º lembrete. Se continuar sem resposta, a recepção é avisada no portal para ligar.
- Quem confirmou recebe um lembrete no dia, algumas horas antes.
- O portal mostra a agenda, o status de cada paciente, as conversas e o que o sistema fez.

Roda de graça no Cloudflare (Workers + banco D1). O código fica neste repositório e é publicado sozinho a cada mudança.

---

## 1. Colocar no ar (uma vez, uns 20 minutos)

### 1.1 Conta no Cloudflare

1. Crie uma conta grátis em [dash.cloudflare.com](https://dash.cloudflare.com).
2. No menu da esquerda, abra **Workers e Pages** uma vez. Isso cria o seu endereço `*.workers.dev`.

### 1.2 Chave de acesso (token) do Cloudflare

1. No canto superior direito, clique no seu perfil e depois em **Meu perfil → Tokens de API → Criar token**.
2. Escolha o modelo **Editar Cloudflare Workers** (*Edit Cloudflare Workers*).
3. Em **Permissões**, adicione mais uma linha: **Conta → D1 → Editar**.
4. Em **Recursos da conta**, escolha a sua conta.
5. Clique em **Continuar** e **Criar token**. Copie o token, porque ele só aparece uma vez.

Pegue também o **ID da conta**: na página inicial do painel, ao lado do nome da conta, use **Copiar ID da conta**.

### 1.3 Segredos no GitHub

No GitHub, abra este repositório e vá em **Settings → Secrets and variables → Actions → New repository secret**. Crie:

| Nome | O que colocar |
|---|---|
| `CLOUDFLARE_API_TOKEN` | o token do passo 1.2 |
| `CLOUDFLARE_ACCOUNT_ID` | o ID da conta |
| `ADMIN_PASSWORD` | a senha que você vai usar para entrar no portal (use uma senha forte) |

### 1.4 Publicar

Vá em **Actions → Testar e publicar → Run workflow**. Quando terminar (fica verde), o endereço do portal aparece no resumo da execução, algo como `https://agenda-cheia.SEU-USUARIO.workers.dev`.

A partir daí, toda mudança no código é publicada sozinha.

### 1.5 Instalar no celular

O portal funciona como aplicativo:

- **Android (Chrome):** abra o endereço do portal e toque em **Instalar app** (ou no menu ⋮ → **Instalar app**).
- **iPhone (Safari):** abra o endereço, toque em **Compartilhar** e depois em **Adicionar à Tela de Início**.

O app ganha ícone próprio, abre em tela cheia e recebe as atualizações sozinho.

---

## 2. Testar sem WhatsApp e sem Google (modo teste)

Logo depois de publicar, já dá para usar:

1. Entre no portal com a `ADMIN_PASSWORD` e cadastre a clínica.
2. Em **Configurações**, preencha o endereço.
3. No **Painel**, use **+ Consulta** para cadastrar pacientes de amanhã (o seu número e de amigos, por exemplo).
4. Clique em **Enviar confirmações agora**.
5. Clique num paciente e responda pelo celular simulado: toque nos botões ou escreva "vou sim", "preciso remarcar" etc.
6. Cadastre alguém na **lista de espera** e peça para remarcar uma consulta: a vaga é oferecida sozinha.

No modo teste nenhuma mensagem real sai. Tudo aparece no portal como se tivesse sido enviado.

### 2.1 Link de demonstração (para mostrar a clínicas interessadas)

Envie o endereço do portal com `/demo` no final, por exemplo `https://agenda-cheia.SEU-SUBDOMINIO.workers.dev/demo`.

- Abre **sem senha**, direto numa clínica fictícia (“Clínica Sorriso”) com consultas da semana, confirmações, remarcação, lista de espera e atividade.
- A demonstração já vem com as telas de gestão ligadas (veja a seção 2.2): 34 fichas de pacientes, anamneses, odontogramas, orçamentos e o caixa do mês.
- Cada pessoa que abre o link ganha **a sua própria cópia**: o que um interessado mexe não aparece para outro, e ninguém vê as suas clínicas de verdade.
- Nenhuma mensagem sai pelo WhatsApp e não dá para ligar o WhatsApp nem o Google Agenda na demonstração.
- O visitante pode tocar num paciente e responder como se fosse ele, para ver o sistema reagindo.
- O botão **Recomeçar** (ou o endereço `/demo?novo`) volta tudo ao início. Cada demonstração é apagada sozinha depois de 1 dia.
- Se você abrir o link no seu próprio celular, o portal passa a mostrar a demonstração. Para voltar à sua conta, toque em **Sair da demonstração** e entre de novo com a senha.

### 2.2 Pacientes, orçamentos e financeiro (novidade em teste)

Telas de gestão da clínica, além da agenda:

- **Pacientes**: lista com busca (nome, telefone ou CPF) e filtros: com consulta marcada, sem retorno há 6 meses (para chamar para revisão), aniversariantes do mês e alerta de saúde. Quem ganha consulta ou entra na lista de espera recebe uma ficha simples sozinho; o botão **Trazer da agenda** cria fichas para quem já tinha consulta.
- **Ficha do paciente**:
  - **Resumo**: dados de contato, documentos, endereço (o CEP preenche o resto), convênio, responsável (para menores), próximas consultas e histórico.
  - **Anamnese**: perguntas de saúde com Sim/Não e detalhes. Respostas como alergia, pressão alta ou diabetes viram um aviso vermelho na ficha e na conversa do WhatsApp.
  - **Odontograma**: toque num dente para marcar cárie, restauração, canal, coroa, implante, ausente etc. O pontinho azul mostra tratamento planejado num orçamento. Tem dentes de leite para crianças.
  - **Orçamentos e pagamentos**: monte o plano de tratamento (procedimento, dente e valor, com desconto e parcelas). Ao **Aprovar**, as parcelas entram no Financeiro como contas a receber. Dá para marcar cada procedimento como feito e imprimir o orçamento.
  - **Evoluções**: o que foi feito em cada atendimento, com data e hora.
  - **Documentos**: atestado, receita, declaração de comparecimento e ficha de anamnese, prontos para imprimir ou salvar em PDF.
- **Financeiro**: mês a mês, com recebido, a receber, despesas e saldo; contas vencidas em destaque; botões **Receber** e **Pagar**; despesas por categoria e total de orçamentos esperando aprovação.

Por enquanto essas telas só aparecem na demonstração. Para ligar numa clínica de verdade: **Configurações → Pacientes, orçamentos e financeiro → Mostrar estas telas no portal**. Na mesma tela ficam a **tabela de procedimentos** (um por linha, `Limpeza = 180`, usada como sugestão de nome e valor) e o **dentista responsável e CRO**, que saem nos documentos.

---

## 3. Conectar o Google Agenda da clínica

### 3.1 Criar a conta de serviço (uma vez, serve para todas as clínicas)

1. Acesse [console.cloud.google.com](https://console.cloud.google.com) e crie um projeto (ex.: "Agenda Cheia").
2. Em **APIs e serviços → Biblioteca**, procure **Google Calendar API** e clique em **Ativar**.
3. Em **IAM e administrador → Contas de serviço → Criar conta de serviço**, dê um nome (ex.: "agenda-cheia") e conclua.
4. Abra a conta criada, vá em **Chaves → Adicionar chave → Criar nova chave → JSON**. Um arquivo é baixado.
5. Abra o arquivo, copie **todo** o conteúdo e crie o segredo `GOOGLE_SERVICE_ACCOUNT` no GitHub (como no passo 1.3).
6. Rode de novo **Actions → Testar e publicar → Run workflow**.

### 3.2 Ligar cada clínica

1. Em **Configurações** do portal aparece o e-mail da conta de serviço (termina em `iam.gserviceaccount.com`).
2. No Google Agenda da clínica, abra **Configurações e compartilhamento** da agenda, depois **Compartilhar com pessoas específicas**. Adicione esse e-mail com a permissão **Fazer alterações nos eventos**.
3. Na mesma página, em **Integrar agenda**, copie o **ID da agenda** e cole no portal.

### 3.3 Como a clínica deve cadastrar as consultas

- **Título:** `Nome do paciente - Procedimento` (ex.: `Maria Costa - Limpeza`)
- **Descrição:** `Tel: (11) 98765-4321` e, se quiser, `Valor: 180`

O sistema lê a agenda a cada 15 minutos. Consultas sem telefone aparecem no portal como "Sem telefone".

---

## 4. Conectar o WhatsApp (API oficial da Meta)

### 4.1 App e número

1. Em [developers.facebook.com](https://developers.facebook.com), crie um app do tipo **Business** e adicione o produto **WhatsApp**.
2. Em **WhatsApp → Configuração da API** aparecem o **número de teste** (grátis, envia para até 5 números cadastrados), o **ID do número de telefone** (*Phone number ID*) e um token temporário.
3. O token temporário vence em 24 horas. Para um token permanente: no **Meta Business Suite → Configurações do negócio → Usuários do sistema**, crie um usuário do sistema, dê acesso ao app e gere um token com as permissões `whatsapp_business_messaging` e `whatsapp_business_management`.

### 4.2 Colar as chaves no portal (mais fácil)

Em **Configurações → WhatsApp**, no portal, cole o **ID do número**, o **token** e a **chave secreta do app** (em **Configurações do app → Básico** na Meta) e salve. Quando o token temporário vencer, é só colar um novo ali.

Se preferir, dá para usar segredos do GitHub no lugar (eles valem para todas as clínicas):

### 4.2.1 Segredos no GitHub (opcional)

| Nome | O que colocar |
|---|---|
| `WHATSAPP_TOKEN` | o token (permanente, de preferência) |
| `WHATSAPP_APP_SECRET` | em **Configurações do app → Básico → Chave secreta do app** |
| `WHATSAPP_VERIFY_TOKEN` | opcional: uma palavra que você inventa. Sem ela, o token de verificação é `agendacheia` |

Depois, rode de novo o **Testar e publicar**.

### 4.3 Webhook (para receber as respostas)

Em **WhatsApp → Configuração**, na parte de **Webhook**:

- **URL de retorno:** `https://SEU-PORTAL.workers.dev/webhook/whatsapp` (o endereço exato aparece em Configurações no portal)
- **Token de verificação:** o mesmo `WHATSAPP_VERIFY_TOKEN`
- Clique em **Verificar e salvar** e assine o campo **messages**.

### 4.4 Modelos de mensagem

Mensagens que a clínica inicia precisam de modelos aprovados. Em **WhatsApp Manager → Modelos de mensagem**, crie os três abaixo, com categoria **Utilidade** e idioma **Português (BR)**. Os nomes e a ordem das variáveis precisam ser exatamente estes:

**`confirmacao_consulta`**
> Olá, {{1}}! Aqui é da {{2}}. Sua consulta de {{3}} está marcada para {{4}} às {{5}}. Você confirma?

Botões de resposta rápida, nesta ordem: `Confirmar` e `Remarcar`.
Variáveis: 1 = primeiro nome, 2 = clínica, 3 = procedimento, 4 = data, 5 = hora.

**`oferta_vaga`**
> Oi, {{1}}! Abriu um horário na {{2}} em {{3}} às {{4}}. Você está na nossa lista de espera. Quer ficar com ele?

Botões de resposta rápida, nesta ordem: `Quero este horário` e `Não posso`.
Variáveis: 1 = primeiro nome, 2 = clínica, 3 = data, 4 = hora.

**`lembrete_consulta`**
> Oi, {{1}}! Lembrete: sua consulta na {{2}} é hoje às {{3}}. Endereço: {{4}}. Até logo!

Sem botões. Variáveis: 1 = primeiro nome, 2 = clínica, 3 = hora, 4 = endereço.

Se você aprovar textos diferentes, atualize os nomes e textos em **Configurações → Modelos aprovados pela Meta**. A ordem das variáveis precisa continuar a mesma.

### 4.5 Ligar para valer

No portal, em **Configurações**, preencha o **ID do número do WhatsApp** e desmarque **Modo teste**.

---

## 5. Como o sistema decide

| Quando | O que acontece |
|---|---|
| A cada 15 min | Lê o Google Agenda: consultas novas, alteradas ou removidas |
| Véspera, 10h | Envia a confirmação (horário configurável) |
| Véspera, 16h | 2º lembrete para quem não respondeu |
| Véspera, 18h | Quem continua sem resposta vai para "Recepção liga" |
| Paciente pede para remarcar | Recebe até 3 horários livres (um por dia) e a opção "Falar com a recepção" |
| Horário liberado | Oferecido ao primeiro da lista de espera, que tem 30 min para aceitar |
| 2h antes | Lembrete para quem confirmou |

Nenhuma mensagem sai fora do horário configurado (padrão: das 7h às 21h). Até 24 horas depois da última mensagem do paciente, as respostas usam mensagens livres, que a Meta não cobra.

---

## Para desenvolvedores

```bash
npm install
printf 'ADMIN_PASSWORD=teste123\nALLOW_TIME_TRAVEL=1\n' > .dev.vars
npm run db:local      # cria as tabelas no banco local
npm run dev           # portal em http://localhost:8787
npm test              # testes
npm run typecheck
```

Com `ALLOW_TIME_TRAVEL=1`, o endpoint `POST /api/clinics/:id/run` aceita `{"now": "2026-10-20T19:00:00Z"}` para simular outro horário.

Estrutura:

- `src/index.ts`: rotas da API, webhook e execução agendada
- `src/engine.ts`: regras (envios, respostas, remarcação, lista de espera, sincronização da agenda)
- `src/google.ts` e `src/whatsapp.ts`: integrações
- `src/records.ts`: pacientes, anamnese, odontograma, evoluções, orçamentos e financeiro (valores em centavos)
- `src/settings.ts`: configurações padrão de cada clínica
- `public/`: portal (HTML, CSS e JavaScript, sem framework); `public/gestao.js` tem as telas de pacientes e financeiro
- `migrations/`: tabelas do banco D1
