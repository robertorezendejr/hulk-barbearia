# Hulk Barbearia

**Barbearia Premium em Virgem Santa, Macaé/RJ**  
Site de agendamento online — degradê, navalhado, social, undercut e muito mais.  
Sala de espera com mesa de sinuca. Horário marcado.

---

![Hero](docs/screenshots/01-hero.png)

---

## Como o site funciona

O cliente agenda em menos de 60 segundos, direto pelo celular ou computador, sem precisar ligar.

### 1 · Escolha o serviço

![Serviços](docs/screenshots/02-servicos.png)

Cards com todos os serviços, duração e valor. Clicar em qualquer card seleciona o serviço e rola automaticamente para o agendamento.

| Serviço | Duração | Valor |
|---|---|---|
| ✂️ Corte Simples | 30 min | R$ 35,00 |
| ✂️ Corte Disfarçado | 45 min | R$ 40,00 |
| 🧔 Barba Comum | 30 min | R$ 25,00 |
| 🔥 Corte + Barba | 60 min | R$ 60,00 |
| 💈 Barboterapia c/ vapor de ozônio | 60 min | R$ 80,00 |

---

### 2 · Escolha o profissional

![Profissional e data](docs/screenshots/04-pro-selecionado.png)

Selecione o barbeiro de preferência. Cada profissional tem sua própria grade de horários disponíveis.

---

### 3 · Escolha o dia e o horário

![Horários e resumo](docs/screenshots/05-resumo.png)

Os próximos dias úteis aparecem em cards. Horários já ocupados ficam bloqueados automaticamente.  
O botão **"Outro dia"** abre um calendário completo para escolher qualquer data futura.

---

### 4 · Modal de calendário

![Calendário](docs/screenshots/06-calendario.png)

Navegue entre meses com as setas. Domingos e datas passadas ficam desativados. Feche com **Esc** ou clicando fora.

---

### 5 · Confirmação via WhatsApp

Após escolher serviço, profissional, data e horário, o resumo aparece com o total. Ao confirmar, o WhatsApp abre com a mensagem já preenchida:

```
*Novo agendamento — Hulk Barbearia* 💚

✂️ Serviço: Corte Simples
💈 Profissional: Luiz Henrique
📅 Data: Segunda, 06/07/2026
🕐 Horário: 08:00
💰 Valor: R$ 35,00 (30 min)

Confirma pra mim, por favor?
```

---

## Estrutura — Diferenciais

![Estrutura](docs/screenshots/07-estrutura.png)

| 🎱 Sinuca | 🛋️ Sala de espera | 📅 Horário marcado | ✂️ Múltiplos estilos |
|---|---|---|---|
| Mesa de sinuca disponível enquanto aguarda | Ambiente climatizado e confortável | Sem fila, chegue no horário certo | Degradê, navalhado, social, undercut e mais |

---

## Equipe

![Profissionais](docs/screenshots/08-profissionais.png)

---

## Contato & Localização

![Contato](docs/screenshots/09-contato.png)

| | |
|---|---|
| 📍 Endereço | Estr. Virgem Santa, 801 - 08, Virgem Santa — Macaé/RJ — CEP 27930-480 |
| 📞 Telefone | (22) 99272-1235 |
| 💬 WhatsApp | (22) 99622-8571 |
| 🕗 Seg–Sex | 08:00 às 19:00 |
| 🕗 Sábado | 08:00 às 18:00 |

---

## Versão Mobile

| Hero | Agendamento |
|---|---|
| ![Mobile hero](docs/screenshots/10-mobile-hero.png) | ![Mobile agendamento](docs/screenshots/11-mobile-agendamento.png) |

Site **mobile-first**: botão flutuante "✂️ Agendar" aparece ao rolar, menu hambúrguer, toque sem delay.

---

## Tecnologias

Site estático puro — sem backend, sem banco de dados, sem build.

| Arquivo | Função |
|---|---|
| `index.html` | Estrutura da página |
| `styles.css` | Visual dark premium + animações + responsividade |
| `app.js` | Agendamento, calendário e integração WhatsApp |
| `vercel.json` | Configuração de deploy |
| `sitemap.xml` | Indexação no Google |
| `robots.txt` | Rastreamento de buscadores |

---

*Hulk Barbearia · Virgem Santa, Macaé/RJ*
