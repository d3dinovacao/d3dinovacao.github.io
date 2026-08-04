# d3dinovacao.github.io

Site e catálogo da **D3D Inovação** (impressão 3D). Estático no GitHub Pages, com
banco de dados em Google Sheets servido por Google Apps Script.

Assinatura da marca: IMPRESSÃO 3D • SOLUÇÕES • INOVAÇÃO

## Arquitetura

```
GitHub Pages (este repo)          Google Apps Script (gas/)         Google Sheets
index.html + css + js  --GET-->   ?action=products            -->   aba Produtos
carrinho no navegador  --POST->   {action:'order', ...}       -->   aba Pedidos (+ e-mail de aviso)
snippet de tracking    --POST->   tracker central controlpanel -->  dashboard de visitas
```

- **Editar o catálogo = editar a planilha** (aba `Produtos`). O site lê via API com
  cache de 5 minutos. Colunas: `id, nome, categoria, descricao, preco, preco_texto,
  imagem, destaque, disponivel, prazo_dias, ordem`.
  - `preco 0` + `preco_texto "sob consulta"` para itens orçados por conversa.
  - `imagem` aceita URL completa (Drive público, ou arquivo em `img/` deste repo
    referenciado como `https://d3dinovacao.github.io/img/arquivo.jpg`).
  - `disponivel FALSE` esconde o item sem apagar a linha.
- **Pedidos** chegam na aba `Pedidos` com id `D3D-AAAAMMDD-XXXX`, e um aviso é
  enviado por e-mail para d3dinovacao@gmail.com.
- O cliente confirma o pedido por **WhatsApp** (quando configurado) ou **e-mail**.

## Configuração (js/config.js)

| Chave | O que é |
|---|---|
| `API_URL` | Web app do Apps Script (não muda entre deploys com `update-deployment`) |
| `WHATSAPP` | Número comercial `55DDDNUMERO`. Vazio = checkout cai para e-mail |
| `EMAIL` | Contato e destino do fallback de pedido |
| `INSTAGRAM` | Link do perfil |
| `TRACKING_URL` | Tracker central do controlpanel. Vazio desativa o tracking |

## Apps Script (gas/)

O código do web app é versionado aqui e publicado com [clasp](https://github.com/google/clasp):

```bash
cd gas
clasp push -f                                  # envia Code.js + appsscript.json
clasp list-deployments                         # ver deployment ativo
clasp update-deployment <deploymentId>         # redeploy mantendo a MESMA URL
```

Primeiro deploy em uma conta nova: rodar a função `authorize` no editor
(script.google.com) uma vez para autorizar os escopos de planilha e e-mail, depois
chamar `?action=setup&key=<SETUP_KEY>` para criar as abas e semear o catálogo.

- Planilha: https://docs.google.com/spreadsheets/d/1TuFhB-su6XFJTP5EXNwFKucQ8zVFR7UZt5wXM0LYh3E
- Projeto Apps Script: https://script.google.com/d/1KeqBVDpcJNlIS8aUSPYYZKI_KCIY3V2IrKVj7lZ3lP6Oj8SKhQYRX7-g/edit

## Identidade visual

Segue o `assets/BRAND.md` do workspace da D3D: fundo off-white `#FDF9F6`, texto
grafite `#444343`, paleta pastel (coral → rosa → lilás → azul lavanda → azul gelo →
verde-água) apenas como acento, tipografia serifada de alto contraste nos títulos
(Fraunces) e sans-serif espaçada na tagline. Sem travessão nos textos da marca.

## Rodar localmente

```bash
python -m http.server
# abrir http://localhost:8000
```

O catálogo carrega da API publicada; não há build.
