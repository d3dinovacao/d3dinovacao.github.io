/* D3D Inovação - catálogo, carrinho e pedidos.
   Dados vêm do Google Apps Script (planilha como banco). */

(function () {
  'use strict';

  var CFG = window.D3D_CONFIG || {};
  var CART_KEY = 'd3d_cart_v1';

  var produtos = [];
  var categoriaAtiva = 'todos';
  var termoBusca = '';

  // Gradientes pastel por categoria para produtos sem foto
  var GRADIENTES = [
    'linear-gradient(135deg, #FDCFB9, #F8CBD4)',
    'linear-gradient(135deg, #F8CBD4, #DAC1E4)',
    'linear-gradient(135deg, #DAC1E4, #C4C6E9)',
    'linear-gradient(135deg, #C4C6E9, #B0D5E0)',
    'linear-gradient(135deg, #B0D5E0, #ACDDD4)'
  ];

  var el = {
    grade: document.getElementById('grade-produtos'),
    estado: document.getElementById('estado-catalogo'),
    chips: document.getElementById('filtros-chips'),
    busca: document.getElementById('busca-input'),
    badge: document.getElementById('carrinho-badge'),
    drawer: document.getElementById('drawer-carrinho'),
    drawerFundo: document.getElementById('drawer-fundo'),
    drawerItens: document.getElementById('drawer-itens'),
    modalFundo: document.getElementById('modal-fundo'),
    modalConteudo: document.getElementById('modal-conteudo'),
    checkoutFundo: document.getElementById('checkout-fundo'),
    formCheckout: document.getElementById('form-checkout'),
    checkoutErro: document.getElementById('checkout-erro'),
    checkoutSucesso: document.getElementById('checkout-sucesso'),
    btnEnviar: document.getElementById('btn-enviar-pedido'),
    toast: document.getElementById('toast')
  };

  // ------------------------------------------------------------ utilidades

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function semAcento(s) {
    return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  }

  var ultimoFoco = null;
  var enviandoPedido = false;

  function overlayAberto() {
    return !el.drawer.hidden || !el.modalFundo.hidden || !el.checkoutFundo.hidden;
  }

  function sincronizarOverlay() {
    var aberto = overlayAberto();
    document.body.classList.toggle('sem-scroll', aberto);
    ['.topo', 'main', '.rodape'].forEach(function (sel) {
      var n = document.querySelector(sel);
      if (n) { if (aberto) n.setAttribute('inert', ''); else n.removeAttribute('inert'); }
    });
    if (!aberto && ultimoFoco) {
      try { ultimoFoco.focus(); } catch (e) { /* elemento sumiu */ }
      ultimoFoco = null;
    }
  }

  function focarDialogo(container) {
    ultimoFoco = ultimoFoco || document.activeElement;
    sincronizarOverlay();
    var alvo = container.querySelector('.btn-fechar') || container;
    try { alvo.focus(); } catch (e) { /* sem foco disponível */ }
  }

  function gradiente(categoria) {
    var soma = 0;
    for (var i = 0; i < categoria.length; i++) soma += categoria.charCodeAt(i);
    return GRADIENTES[soma % GRADIENTES.length];
  }

  function toast(msg) {
    el.toast.textContent = msg;
    el.toast.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { el.toast.hidden = true; }, 2600);
  }

  // -------------------------------------------------------------- catálogo

  function carregarProdutos() {
    if (!CFG.API_URL) {
      el.estado.textContent = 'Catálogo em configuração. Volte em breve.';
      return;
    }
    fetch(CFG.API_URL + '?action=products', { redirect: 'follow' })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (data) {
        produtos = (data && data.products) || [];
        montarChips();
        render();
      })
      .catch(function () {
        el.estado.innerHTML = 'Não foi possível carregar o catálogo agora. ' +
          '<button class="chip" id="btn-tentar">Tentar de novo</button>';
        var btn = document.getElementById('btn-tentar');
        if (btn) btn.addEventListener('click', function () {
          el.estado.textContent = 'Carregando o catálogo...';
          carregarProdutos();
        });
      });
  }

  function categorias() {
    var vistas = [];
    produtos.forEach(function (p) {
      if (p.categoria && vistas.indexOf(p.categoria) === -1) vistas.push(p.categoria);
    });
    return vistas;
  }

  function montarChips() {
    var html = '<button class="chip ativo" data-cat="todos">Todos</button>';
    categorias().forEach(function (c) {
      html += '<button class="chip" data-cat="' + esc(c) + '">' + esc(c) + '</button>';
    });
    el.chips.innerHTML = html;
    el.chips.querySelectorAll('.chip').forEach(function (chip) {
      chip.addEventListener('click', function () {
        categoriaAtiva = chip.getAttribute('data-cat');
        el.chips.querySelectorAll('.chip').forEach(function (c) { c.classList.remove('ativo'); });
        chip.classList.add('ativo');
        render();
      });
    });
  }

  function filtrados() {
    return produtos.filter(function (p) {
      if (categoriaAtiva !== 'todos' && p.categoria !== categoriaAtiva) return false;
      if (termoBusca) {
        var alvo = semAcento(p.nome + ' ' + p.descricao + ' ' + p.categoria);
        if (alvo.indexOf(termoBusca) === -1) return false;
      }
      return true;
    });
  }

  function imgHtml(p, classe) {
    if (p.imagem) {
      return '<img src="' + esc(p.imagem) + '" alt="' + esc(p.nome) + '" loading="lazy">';
    }
    return '<span aria-hidden="true">' + esc(p.nome.charAt(0)) + '</span>';
  }

  function render() {
    var lista = filtrados();
    var status = document.getElementById('resultado-busca');
    if (status) {
      status.textContent = lista.length === 1 ? '1 produto encontrado'
        : lista.length + ' produtos encontrados';
    }
    if (!lista.length) {
      el.grade.innerHTML = '<p class="estado">Nenhum produto encontrado.</p>';
      return;
    }
    var html = '';
    lista.forEach(function (p) {
      var fundo = p.imagem ? '' : ' style="background:' + gradiente(p.categoria) + '"';
      html += '<article class="card-produto">' +
        '<button class="card-img" data-id="' + esc(p.id) + '" aria-label="Ver detalhes de ' + esc(p.nome) + '"' + fundo + '>' + imgHtml(p) + '</button>' +
        '<div class="card-corpo">' +
          (p.destaque ? '<span class="card-badge">Destaque</span>' : '') +
          '<button class="card-nome" data-id="' + esc(p.id) + '">' + esc(p.nome) + '</button>' +
          '<p class="card-desc">' + esc(p.descricao) + '</p>' +
          (p.prazoDias ? '<p class="card-prazo">Prazo: até ' + (Number(p.prazoDias) || 0) + ' dias úteis</p>' : '') +
          '<div class="card-acoes">' +
            '<button class="btn btn-primario" data-add="' + esc(p.id) + '">Adicionar</button>' +
          '</div>' +
        '</div></article>';
    });
    el.grade.innerHTML = html;

    el.grade.querySelectorAll('[data-add]').forEach(function (btn) {
      btn.addEventListener('click', function () { addCarrinho(btn.getAttribute('data-add')); });
    });
    el.grade.querySelectorAll('[data-id]').forEach(function (btn) {
      if (btn.hasAttribute('data-add')) return;
      btn.addEventListener('click', function () { abrirModal(btn.getAttribute('data-id')); });
    });
  }

  // ----------------------------------------------------------------- modal

  function abrirModal(id) {
    var p = produtos.filter(function (x) { return x.id === id; })[0];
    if (!p) return;
    var fundo = p.imagem ? '' : ' style="background:' + gradiente(p.categoria) + '"';
    el.modalConteudo.innerHTML =
      '<div class="modal-img"' + fundo + '>' + imgHtml(p) + '</div>' +
      '<p class="modal-categoria">' + esc(p.categoria) + '</p>' +
      '<h2 id="modal-titulo">' + esc(p.nome) + '</h2>' +
      '<p class="modal-desc">' + esc(p.descricao) + '</p>' +
      (p.prazoDias ? '<p class="modal-prazo">Produção em até ' + (Number(p.prazoDias) || 0) + ' dias úteis após a confirmação.</p>' : '') +
      '<button class="btn btn-primario btn-cheio" data-modal-add="' + esc(p.id) + '">Adicionar ao carrinho</button>';
    el.modalFundo.hidden = false;
    focarDialogo(el.modalFundo);
    el.modalConteudo.querySelector('[data-modal-add]').addEventListener('click', function () {
      addCarrinho(p.id);
      fecharModal();
    });
  }

  function fecharModal() { el.modalFundo.hidden = true; sincronizarOverlay(); }

  // -------------------------------------------------------------- carrinho

  function lerCarrinho() {
    try {
      var raw = localStorage.getItem(CART_KEY);
      var itens = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(itens)) return [];
      return itens.filter(function (i) {
        return i && typeof i.id === 'string' && isFinite(Number(i.qtd)) && Number(i.qtd) > 0;
      }).map(function (i) {
        i.qtd = Math.min(999, Math.floor(Number(i.qtd)));
        return i;
      });
    } catch (e) { return []; }
  }

  function salvarCarrinho(itens) {
    try { localStorage.setItem(CART_KEY, JSON.stringify(itens)); } catch (e) { /* modo privado */ }
    atualizarBadge(itens);
  }

  function atualizarBadge(itens) {
    itens = itens || lerCarrinho();
    var qtd = itens.reduce(function (s, i) { return s + i.qtd; }, 0);
    el.badge.hidden = qtd === 0;
    el.badge.textContent = qtd;
  }

  function addCarrinho(id) {
    var p = produtos.filter(function (x) { return x.id === id; })[0];
    if (!p) return;
    var itens = lerCarrinho();
    var existente = itens.filter(function (i) { return i.id === id; })[0];
    if (existente) existente.qtd += 1;
    else itens.push({ id: p.id, nome: p.nome, qtd: 1 });
    salvarCarrinho(itens);
    toast(p.nome + ' no carrinho');
    renderCarrinho();
  }

  function mudarQtd(id, delta) {
    var itens = lerCarrinho();
    var item = itens.filter(function (i) { return i.id === id; })[0];
    if (!item) return;
    item.qtd += delta;
    if (item.qtd <= 0) itens = itens.filter(function (i) { return i.id !== id; });
    salvarCarrinho(itens);
    renderCarrinho();
  }

  function removerItem(id) {
    salvarCarrinho(lerCarrinho().filter(function (i) { return i.id !== id; }));
    renderCarrinho();
  }

  function renderCarrinho() {
    var itens = lerCarrinho();
    if (!itens.length) {
      el.drawerItens.innerHTML = '<p class="drawer-vazio">Seu carrinho está vazio.</p>';
      return;
    }
    var html = '';
    itens.forEach(function (i) {
      html += '<div class="item-carrinho">' +
        '<div class="item-info">' +
          '<p class="item-nome">' + esc(i.nome) + '</p>' +
          '<button class="item-remover" data-rm="' + esc(i.id) + '">remover</button>' +
        '</div>' +
        '<div class="item-qtd">' +
          '<button data-menos="' + esc(i.id) + '" aria-label="Diminuir quantidade">&minus;</button>' +
          '<span>' + i.qtd + '</span>' +
          '<button data-mais="' + esc(i.id) + '" aria-label="Aumentar quantidade">+</button>' +
        '</div></div>';
    });
    el.drawerItens.innerHTML = html;

    el.drawerItens.querySelectorAll('[data-mais]').forEach(function (b) {
      b.addEventListener('click', function () { mudarQtd(b.getAttribute('data-mais'), 1); });
    });
    el.drawerItens.querySelectorAll('[data-menos]').forEach(function (b) {
      b.addEventListener('click', function () { mudarQtd(b.getAttribute('data-menos'), -1); });
    });
    el.drawerItens.querySelectorAll('[data-rm]').forEach(function (b) {
      b.addEventListener('click', function () { removerItem(b.getAttribute('data-rm')); });
    });
  }

  function abrirCarrinho() {
    renderCarrinho();
    el.drawer.hidden = false;
    el.drawerFundo.hidden = false;
    focarDialogo(el.drawer);
  }

  function fecharCarrinho() {
    el.drawer.hidden = true;
    el.drawerFundo.hidden = true;
    sincronizarOverlay();
  }

  // -------------------------------------------------------------- checkout

  function abrirCheckout() {
    var itens = lerCarrinho();
    if (!itens.length) { toast('Adicione um produto antes de enviar o pedido'); return; }
    fecharCarrinho();
    el.formCheckout.hidden = false;
    el.checkoutSucesso.hidden = true;
    el.checkoutErro.hidden = true;
    el.checkoutFundo.hidden = false;
    focarDialogo(el.checkoutFundo);
  }

  function fecharCheckout() {
    if (enviandoPedido) return;
    el.checkoutFundo.hidden = true;
    sincronizarOverlay();
  }

  function mensagemPedido(itens, pedidoId) {
    var linhas = ['Olá! Fiz um pedido pelo site da D3D.', ''];
    if (pedidoId) linhas.push('Pedido: ' + pedidoId);
    itens.forEach(function (i) {
      linhas.push('- ' + i.qtd + 'x ' + i.nome);
    });
    linhas.push('', 'Aguardo o orçamento.');
    return linhas.join('\n');
  }

  function enviarPedido(ev) {
    ev.preventDefault();
    var form = el.formCheckout;
    var itens = lerCarrinho();
    if (!itens.length) { fecharCheckout(); return; }

    var payload = {
      action: 'order',
      nome: form.nome.value.trim(),
      contato: form.contato.value.trim(),
      observacoes: form.observacoes.value.trim(),
      origem: location.origin,
      itens: itens.map(function (i) { return { id: i.id, nome: i.nome, qtd: i.qtd }; })
    };

    enviandoPedido = true;
    el.btnEnviar.disabled = true;
    el.btnEnviar.textContent = 'Enviando...';
    el.checkoutErro.hidden = true;

    fetch(CFG.API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(payload),
      redirect: 'follow'
    })
      .then(function (r) { return r.json(); })
      .then(function (resp) {
        if (resp && resp.success) {
          concluirPedido(itens, resp.pedidoId, payload);
        } else {
          throw new Error((resp && resp.error) || 'erro');
        }
      })
      .catch(function () {
        el.checkoutErro.textContent = 'Não foi possível enviar agora. Tente de novo ou chame a gente no Instagram.';
        el.checkoutErro.hidden = false;
      })
      .then(function () {
        enviandoPedido = false;
        el.btnEnviar.disabled = false;
        el.btnEnviar.textContent = 'Enviar pedido';
      });
  }

  function concluirPedido(itens, pedidoId, payload) {
    var msg = mensagemPedido(itens, pedidoId);
    var linkHtml;

    if (CFG.WHATSAPP && /^\d{10,15}$/.test(CFG.WHATSAPP)) {
      var wa = 'https://wa.me/' + CFG.WHATSAPP + '?text=' + encodeURIComponent(msg);
      linkHtml = '<a class="btn btn-primario btn-cheio" href="' + wa + '" target="_blank" rel="noopener">Confirmar no WhatsApp</a>';
    } else {
      var mail = 'mailto:' + CFG.EMAIL +
        '?subject=' + encodeURIComponent('Pedido ' + (pedidoId || '') + ' - site D3D') +
        '&body=' + encodeURIComponent(msg + '\n\nNome: ' + payload.nome + '\nContato: ' + payload.contato);
      linkHtml = '<a class="btn btn-primario btn-cheio" href="' + mail + '">Confirmar por e-mail</a>';
    }

    el.formCheckout.hidden = true;
    el.checkoutSucesso.innerHTML =
      '<div class="checkout-sucesso-caixa">' +
        '<h3>Pedido ' + esc(pedidoId || '') + ' registrado</h3>' +
        '<p>Recebemos seu pedido e vamos te chamar para confirmar valores, prazo e pagamento. Se preferir, confirme agora:</p>' +
        linkHtml +
      '</div>';
    el.checkoutSucesso.hidden = false;
    // Garante que a confirmação fica visível mesmo se o modal foi fechado no meio
    el.checkoutFundo.hidden = false;
    sincronizarOverlay();

    salvarCarrinho([]);
    renderCarrinho();
  }

  // ------------------------------------------------------------- contatos

  function aplicarContatos() {
    var ig = document.getElementById('link-instagram');
    var em = document.getElementById('link-email');
    var wa = document.getElementById('link-whatsapp');
    if (CFG.INSTAGRAM) ig.href = CFG.INSTAGRAM;
    if (CFG.EMAIL) { em.href = 'mailto:' + CFG.EMAIL; em.textContent = CFG.EMAIL; }
    if (CFG.WHATSAPP && /^\d{10,15}$/.test(CFG.WHATSAPP)) {
      wa.href = 'https://wa.me/' + CFG.WHATSAPP;
      wa.hidden = false;
      wa.target = '_blank';
      wa.rel = 'noopener';
    }
  }

  // --------------------------------------------------------------- eventos

  document.getElementById('btn-carrinho').addEventListener('click', abrirCarrinho);
  document.getElementById('btn-fechar-carrinho').addEventListener('click', fecharCarrinho);
  el.drawerFundo.addEventListener('click', fecharCarrinho);
  document.getElementById('btn-finalizar').addEventListener('click', abrirCheckout);

  document.getElementById('btn-fechar-modal').addEventListener('click', fecharModal);
  el.modalFundo.addEventListener('click', function (ev) { if (ev.target === el.modalFundo) fecharModal(); });

  document.getElementById('btn-fechar-checkout').addEventListener('click', fecharCheckout);
  el.checkoutFundo.addEventListener('click', function (ev) { if (ev.target === el.checkoutFundo) fecharCheckout(); });

  el.formCheckout.addEventListener('submit', enviarPedido);

  el.busca.addEventListener('input', function () {
    termoBusca = semAcento(el.busca.value.trim());
    render();
  });

  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape') { fecharModal(); fecharCheckout(); fecharCarrinho(); }
  });

  // ----------------------------------------------------------------- init

  aplicarContatos();
  atualizarBadge();
  carregarProdutos();
})();
