/**
 * D3D Inovação - API do catálogo e pedidos
 *
 * Planilha como banco de dados, três abas:
 *   Produtos - catálogo (editar aqui é o "admin" do site)
 *   Pedidos  - pedidos enviados pelo site
 *   Visitas  - tracking LGPD (18 campos anônimos, mesmo formato do controlpanel)
 *
 * Endpoints (web app, acesso anônimo):
 *   GET  ?action=products      -> JSON do catálogo (só itens disponíveis)
 *   GET  ?action=ping          -> healthcheck
 *   GET  ?action=setup&key=... -> cria abas e semeia produtos (guardado por chave)
 *   POST {action:'order', ...} -> grava pedido + e-mail de aviso
 *   POST {page, timestamp,...} -> grava visita (payload do snippet de tracking)
 */

var SPREADSHEET_ID = '1TuFhB-su6XFJTP5EXNwFKucQ8zVFR7UZt5wXM0LYh3E';
var SETUP_KEY = 'd3d-setup-7f2k9';
var NOTIFY_EMAIL = 'd3dinovacao@gmail.com';
var CACHE_SECONDS = 300;

var PRODUCT_HEADERS = [
  'id', 'nome', 'categoria', 'descricao', 'preco', 'preco_texto',
  'imagem', 'destaque', 'disponivel', 'prazo_dias', 'ordem'
];

var ORDER_HEADERS = [
  'timestamp', 'pedido_id', 'nome', 'contato', 'itens', 'total',
  'observacoes', 'origem', 'status'
];

var VISIT_HEADERS = [
  'timestamp', 'timezone', 'timezoneOffset', 'page', 'pathname', 'referrer',
  'pageTitle', 'language', 'deviceType', 'screenOrientation', 'connectionType',
  'loadTime', 'utmSource', 'utmMedium', 'utmCampaign', 'utmTerm', 'utmContent',
  'prefersColorScheme', 'origin'
];

// Preços reais do plano v3 (maquetes, mapa tátil, peça técnica, boneca).
// Os demais são valores iniciais editáveis direto na aba Produtos.
var SEED_PRODUCTS = [
  ['boneca-3d', 'Boneca 3D personalizada', 'Personalizados',
    'Miniatura de 15 cm modelada a partir das suas fotos e impressa em 3D. Pintura à mão opcional.',
    200, '', '', true, true, 15, 1],
  ['cortador-carimbo', 'Cortador e carimbo de biscoito personalizado', 'Personalizados',
    'Kit com cortador, carimbo de relevo e pegador, desenhado a partir da sua arte ou tema.',
    80, 'a partir de R$ 80', '', true, true, 10, 2],
  ['luminaria-litofania', 'Luminária litofania personalizada', 'Personalizados',
    'Sua foto vira luminária: a imagem aparece quando a luz acende. Presente único para datas especiais.',
    120, 'a partir de R$ 120', '', false, true, 12, 3],
  ['topo-de-bolo', 'Topo de bolo personalizado', 'Personalizados',
    'Topo de bolo com nome, tema e cores da festa, modelado sob medida.',
    70, 'a partir de R$ 70', '', false, true, 10, 4],
  ['chaveiros-lote', 'Chaveiros personalizados, lote com 10', 'Personalizados',
    'Lote de 10 chaveiros com logo ou nome, para brindes, eventos e lembrancinhas.',
    90, 'a partir de R$ 90', '', false, true, 7, 5],
  ['maquete-relevo-a5', 'Maquete de relevo A5', 'Mapas e relevo',
    'O relevo real do seu município ou região impresso em 3D a partir de dados de elevação de satélite. Formato A5.',
    220, '', '', false, true, 15, 6],
  ['maquete-relevo-a4', 'Maquete de relevo A4 premium', 'Mapas e relevo',
    'Relevo em formato A4 com acabamento premium, a partir de dados de elevação reais. Peça de parede ou de mesa.',
    480, '', '', true, true, 20, 7],
  ['mapa-tatil', 'Mapa tátil institucional, NBR 9050', 'Mapas e relevo',
    'Mapa tátil acessível para órgãos públicos e empresas, conforme NBR 9050 e Lei Brasileira de Inclusão. Projeto, impressão e memorial descritivo.',
    0, 'sob consulta', '', true, true, 30, 8],
  ['peca-tecnica', 'Peça técnica sob medida', 'Empresas e sob medida',
    'Peça de reposição ou adaptação modelada a partir de amostra, foto ou desenho.',
    100, 'R$ 100 a R$ 150', '', false, true, 10, 9],
  ['lote-b2b', 'Lote de peças para empresas', 'Empresas e sob medida',
    'Produção em série: gabaritos, suportes, protótipos e brindes corporativos.',
    0, 'sob consulta', '', false, true, 15, 10],
  ['vaso-decorativo', 'Vaso decorativo', 'Casa e decoração',
    'Vasos impressos em 3D em formatos exclusivos para plantas e ambientes.',
    45, 'a partir de R$ 45', '', false, true, 7, 11],
  ['organizador-mesa', 'Organizador de mesa', 'Casa e decoração',
    'Organizadores para escritório e casa: canetas, cabos, fones e pequenos objetos.',
    55, 'a partir de R$ 55', '', false, true, 7, 12],
  ['suporte-celular', 'Suporte para celular', 'Casa e decoração',
    'Suporte de mesa para celular ou tablet, estável e leve.',
    35, '', '', false, true, 5, 13]
];

// ---------------------------------------------------------------- entrypoints

function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) || 'products';
  try {
    if (action === 'ping') {
      return json_({ ok: true, service: 'd3d-catalogo', time: new Date().toISOString() });
    }
    if (action === 'setup') {
      if (!e.parameter.key || e.parameter.key !== SETUP_KEY) {
        return json_({ error: 'unauthorized' });
      }
      return json_(setup_(e.parameter.force === '1'));
    }
    if (action === 'products') {
      return productsJson_();
    }
    return json_({ error: 'unknown action' });
  } catch (err) {
    return json_({ error: String(err) });
  }
}

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    if (data && data.action === 'order') {
      return json_(recordOrder_(data));
    }
    // Sem action: payload do snippet de tracking (tem page + timestamp)
    if (data && data.page && data.timestamp) {
      return json_(recordVisit_(data));
    }
    return json_({ error: 'invalid payload' });
  } catch (err) {
    return json_({ error: String(err) });
  }
}

// ------------------------------------------------------------------- produtos

function productsJson_() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get('products_json');
  if (cached) {
    return ContentService.createTextOutput(cached)
      .setMimeType(ContentService.MimeType.JSON);
  }

  var sheet = getSheet_('Produtos');
  var out = { products: [], updated: new Date().toISOString() };
  if (sheet.getLastRow() > 1) {
    var values = sheet.getRange(1, 1, sheet.getLastRow(), PRODUCT_HEADERS.length).getValues();
    var headers = values[0].map(String);
    for (var i = 1; i < values.length; i++) {
      var row = {};
      for (var c = 0; c < headers.length; c++) row[headers[c]] = values[i][c];
      if (!row.id || String(row.disponivel).toUpperCase() === 'FALSE' || row.disponivel === false) continue;
      out.products.push({
        id: String(row.id),
        nome: String(row.nome),
        categoria: String(row.categoria),
        descricao: String(row.descricao),
        preco: Number(row.preco) || 0,
        precoTexto: String(row.preco_texto || ''),
        imagem: String(row.imagem || ''),
        destaque: row.destaque === true || String(row.destaque).toUpperCase() === 'TRUE',
        prazoDias: Number(row.prazo_dias) || 0,
        ordem: Number(row.ordem) || 999
      });
    }
    out.products.sort(function (a, b) { return a.ordem - b.ordem; });
  }

  var text = JSON.stringify(out);
  cache.put('products_json', text, CACHE_SECONDS);
  return ContentService.createTextOutput(text)
    .setMimeType(ContentService.MimeType.JSON);
}

// -------------------------------------------------------------------- pedidos

function recordOrder_(data) {
  var nome = clean_(data.nome, 120);
  var contato = clean_(data.contato, 120);
  var observacoes = clean_(data.observacoes, 500);
  var origem = clean_(data.origem, 200);
  var itens = [];
  var total = 0;

  if (!nome || !contato) return { error: 'nome e contato são obrigatórios' };
  if (!Array.isArray(data.itens) || data.itens.length === 0) {
    return { error: 'carrinho vazio' };
  }

  for (var i = 0; i < Math.min(data.itens.length, 50); i++) {
    var it = data.itens[i];
    var qtd = Math.max(1, Math.min(999, parseInt(it.qtd, 10) || 1));
    var nomeItem = clean_(it.nome, 120);
    var preco = Number(it.preco) || 0;
    var sub = preco * qtd;
    total += sub;
    itens.push(qtd + 'x ' + nomeItem + (preco > 0
      ? ' (' + brl_(preco) + ') = ' + brl_(sub)
      : ' (sob consulta)'));
  }

  var pedidoId = 'D3D-' +
    Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'yyyyMMdd') + '-' +
    Utilities.getUuid().slice(0, 4).toUpperCase();

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    getSheet_('Pedidos').appendRow([
      new Date(), pedidoId, nome, contato, itens.join('\n'),
      total, observacoes, origem, 'novo'
    ]);
  } finally {
    lock.releaseLock();
  }

  try {
    MailApp.sendEmail(
      NOTIFY_EMAIL,
      'Novo pedido ' + pedidoId + ' no site D3D',
      'Pedido: ' + pedidoId + '\n' +
      'Nome: ' + nome + '\n' +
      'Contato: ' + contato + '\n\n' +
      'Itens:\n' + itens.join('\n') + '\n\n' +
      'Total estimado: ' + brl_(total) + '\n' +
      (observacoes ? 'Observações: ' + observacoes + '\n' : '') +
      '\nPlanilha: https://docs.google.com/spreadsheets/d/' + SPREADSHEET_ID
    );
  } catch (mailErr) {
    // Sem quota de e-mail não pode derrubar o pedido
  }

  return { success: true, pedidoId: pedidoId, total: total };
}

// -------------------------------------------------------------------- visitas

function recordVisit_(data) {
  var row = VISIT_HEADERS.map(function (h) {
    var v = data[h];
    if (v === undefined || v === null) return '';
    return clean_(String(v), 500);
  });

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    getSheet_('Visitas').appendRow(row);
  } finally {
    lock.releaseLock();
  }
  return { success: true };
}

// ---------------------------------------------------------------------- setup

function setup_(force) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);

  var produtos = ensureSheet_(ss, 'Produtos', PRODUCT_HEADERS);
  ensureSheet_(ss, 'Pedidos', ORDER_HEADERS);
  ensureSheet_(ss, 'Visitas', VISIT_HEADERS);

  // Remove a aba padrão vazia criada junto com a planilha
  var defaults = ['Sheet1', 'Página1', 'Page 1'];
  for (var i = 0; i < defaults.length; i++) {
    var def = ss.getSheetByName(defaults[i]);
    if (def && ss.getSheets().length > 3) ss.deleteSheet(def);
  }

  var seeded = false;
  if (force || produtos.getLastRow() <= 1) {
    if (produtos.getLastRow() > 1) {
      produtos.getRange(2, 1, produtos.getLastRow() - 1, PRODUCT_HEADERS.length).clearContent();
    }
    produtos.getRange(2, 1, SEED_PRODUCTS.length, PRODUCT_HEADERS.length)
      .setValues(SEED_PRODUCTS);
    seeded = true;
  }

  CacheService.getScriptCache().remove('products_json');
  return { success: true, seeded: seeded, produtos: SEED_PRODUCTS.length };
}

// -------------------------------------------------------------------- helpers

function getSheet_(name) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    var headers = name === 'Produtos' ? PRODUCT_HEADERS
      : name === 'Pedidos' ? ORDER_HEADERS : VISIT_HEADERS;
    sheet = ensureSheet_(ss, name, headers);
  }
  return sheet;
}

function ensureSheet_(ss, name, headers) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function clean_(value, maxLen) {
  if (value === undefined || value === null) return '';
  return String(value).replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, maxLen);
}

function brl_(n) {
  return 'R$ ' + Number(n).toFixed(2).replace('.', ',');
}

/** Rodar uma vez no editor para autorizar os escopos (planilha + e-mail). */
function authorize() {
  getSheet_('Produtos');
  Logger.log('ok');
}
