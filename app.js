/* ===================================================
   HUB DE GESTÃO - RÓTULOS & ETIQUETAS
   Versão 1.0 — Maio 2026
=================================================== */

// ===== DADOS =====
const DB = {
  faturamento_mensal: [],
  canais: { interno: 0, externo: 0 },
  vendedores: [],
  top_produtos: [],
  notas: [],
  ordens: [],
  maquinas: [],
  usuarios: [],
  modelos_produto: [],
  orcamentos: [],
};

// ===== UTILITÁRIOS =====
const fmt = {
  moeda: v => 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  num:   v => Number(v).toLocaleString('pt-BR'),
  pct:   v => Number(v).toFixed(1) + '%',
  data:  s => { if (!s) return '—'; const [y,m,d] = s.split('-'); return `${d}/${m}/${y}`; },
  atrasada: (previsao) => { return previsao && new Date(previsao) < new Date() ? true : false; },
};

// ===== REGRAS DE MARGEM (central — altere aqui para refletir em todo o sistema) =====
function margemInfo(pct) {
  if (pct > 13)  return { cor: '#16a34a', bg: '#dcfce7', cls: 'saudavel', label: '✓ Margem saudável'    };
  if (pct >= 8)  return { cor: '#d97706', bg: '#fef3c7', cls: 'razoavel', label: '~ Margem razoável'    };
  if (pct >= 1)  return { cor: '#ea580c', bg: '#ffedd5', cls: 'baixa',    label: '⚠ Margem baixa'       };
  return           { cor: '#dc2626', bg: '#fee2e2', cls: 'risco',    label: '✗ Risco de prejuízo'  };
}

function statusBadge(s) {
  const map = {
    'Emitida':'badge-green','Cancelada':'badge-red','Em Produção':'badge-blue',
    'Aguardando':'badge-amber','Pronto':'badge-purple','Entregue':'badge-gray',
    'Em Análise':'badge-amber','Aprovado':'badge-green','Reprovado':'badge-red',
    'Aguardando Cliente':'badge-blue','Rodando':'badge-green','Setup':'badge-amber',
    'Disponível':'badge-blue','Manutenção':'badge-red','Parada':'badge-gray',
  };
  return `<span class="badge ${map[s]||'badge-gray'}">${s}</span>`;
}

function prioridadeBadge(p) {
  return p === 'Alta'
    ? '<span class="badge badge-red">Alta</span>'
    : '<span class="badge badge-gray">Normal</span>';
}

// ===== DADOS SEMENTE (usados no primeiro acesso ou modo demo) =====
const SEED_ORCAMENTOS = [];
const SEED_MODELOS    = [];
const SEED_USUARIOS   = [];

// Limpa DB — será preenchido pelo Firebase (ou seed em modo demo)
DB.orcamentos      = [];
DB.modelos_produto = [];
DB.usuarios        = [];

function canalBadge(c) {
  return c === 'Externo'
    ? '<span class="badge badge-purple">Externo</span>'
    : '<span class="badge badge-blue">Interno</span>';
}

function closeModal(id) {
  document.getElementById(id).classList.remove('open');
}

// ===== APP PRINCIPAL =====
const App = {
  currentPage: 'bi',
  charts: {},

  init() {
    // Inicializa Firebase (gerencia login e carregamento de dados)
    Firebase.init();
  },

  _start() {
    // Chamado após login bem-sucedido pelo Firebase
    Auth.init();
    document.querySelectorAll('.nav-item[data-page]').forEach(item => {
      item.addEventListener('click', e => {
        e.preventDefault();
        App.navigate(item.dataset.page);
      });
    });
    document.getElementById('menuToggle').addEventListener('click', () => {
      document.getElementById('sidebar').classList.toggle('collapsed');
    });
    App.updateBadges();
    // Navega para o primeiro módulo com permissão
    const ordem = ['bi','faturamento','pcp','maquinas','orcamentos'];
    const p = Firebase.currentPerms;
    const inicio = ordem.find(m => p[m] !== false) || 'bi';
    App.navigate(inicio);
  },

  navigate(page) {
    document.querySelectorAll('.nav-item[data-page]').forEach(i => i.classList.toggle('active', i.dataset.page === page));
    document.querySelectorAll('.page').forEach(p => p.classList.toggle('active', p.id === `page-${page}`));
    App.currentPage = page;

    const titles = {
      bi:          ['Dashboard BI', 'Visão geral do negócio'],
      faturamento: ['Faturamento', 'Notas fiscais e receita por período'],
      pcp:         ['PCP — Planejamento e Controle', 'Ordens de produção e status fabril'],
      maquinas:    ['Programação de Máquinas', 'Capacidade, fila e agenda da produção'],
      orcamentos:  ['Orçamentos', 'Criação, gestão e conversão de propostas'],
      admin:       ['Modelos de Produto', 'Configure os modelos usados nos orçamentos'],
    };
    const [title, sub] = titles[page] || ['Hub de Gestão', ''];
    document.getElementById('pageTitle').textContent = title;
    document.getElementById('pageSubtitle').textContent = sub;

    const renders = { bi: () => BI.render(), faturamento: () => Faturamento.render(), pcp: () => PCP.render(), maquinas: () => Maquinas.render(), orcamentos: () => Orcamentos.render(), admin: () => AdminPage.render() };
    if (renders[page]) renders[page]();
  },

  changePeriod(v) {
    if (App.currentPage === 'bi') BI.render();
  },

  updateBadges() {
    const opAbertas = DB.ordens.filter(o => ['Aguardando','Em Produção'].includes(o.status)).length;
    const orcAnalise = DB.orcamentos.filter(o => ['Gerado','Revisão','Em Negociação'].includes(o.status)).length;
    document.getElementById('badge-pcp').textContent = opAbertas;
    document.getElementById('badge-orcamentos').textContent = orcAnalise;
  },
};

// ===== BI DASHBOARD =====
const BI = {
  render() {
    const ultimo  = DB.faturamento_mensal.length > 0 ? DB.faturamento_mensal[DB.faturamento_mensal.length - 1] : null;
    const anterior = DB.faturamento_mensal.length > 1 ? DB.faturamento_mensal[DB.faturamento_mensal.length - 2] : null;

    const lucro    = ultimo ? ultimo.valor - ultimo.custos - ultimo.despesas : 0;
    const margem   = ultimo && ultimo.valor ? ((ultimo.valor - ultimo.custos) / ultimo.valor) * 100 : 0;
    const lucroLiq = ultimo && ultimo.valor ? (lucro / ultimo.valor) * 100 : 0;
    const deltaPct = (ultimo && anterior) ? ((ultimo.valor - anterior.valor) / anterior.valor * 100).toFixed(1) : '0.0';

    const totalNFs    = DB.notas.filter(n => n.status === 'Emitida').length;
    const somaEmitidas = DB.notas.filter(n => n.status === 'Emitida').reduce((s,n) => s + n.valor, 0);
    const ticketMedio = totalNFs ? somaEmitidas / totalNFs : 0;

    document.getElementById('kpi-faturamento').textContent = ultimo ? fmt.moeda(ultimo.valor) : 'R$ 0,00';
    document.getElementById('kpi-faturamento-delta').textContent = anterior ? `${deltaPct > 0 ? '+' : ''}${deltaPct}% vs mês anterior` : 'Sem dados anteriores';
    document.getElementById('kpi-faturamento-delta').className = `kpi-delta ${deltaPct >= 0 ? 'positive' : 'negative'}`;

    document.getElementById('kpi-margem').textContent = fmt.pct(margem);
    document.getElementById('kpi-margem-delta').textContent = ultimo ? `Custo: ${fmt.moeda(ultimo.custos)}` : 'Sem dados';

    document.getElementById('kpi-lucro').textContent = fmt.moeda(lucro);
    document.getElementById('kpi-lucro-delta').textContent = `${fmt.pct(lucroLiq)} da receita`;

    document.getElementById('kpi-nfs').textContent = totalNFs;
    document.getElementById('kpi-nfs-delta').textContent = totalNFs ? `ticket médio ${fmt.moeda(ticketMedio)}` : 'Nenhuma nota emitida';

    // Ticket médio de orçamentos
    const totalOrc = DB.orcamentos.length;
    const somaOrc  = DB.orcamentos.reduce((s,o) => s + o.qtd * o.preco_unit, 0);
    const ticketOrc = totalOrc ? somaOrc / totalOrc : 0;
    const elTO = document.getElementById('kpi-orc-ticket');
    if (elTO) elTO.textContent = fmt.moeda(ticketOrc);
    const elTOD = document.getElementById('kpi-orc-ticket-delta');
    if (elTOD) elTOD.textContent = `${totalOrc} orçamento${totalOrc !== 1 ? 's' : ''}`;

    BI.renderChartFaturamento();
    BI.renderChartCanal();
    BI.renderChartVendedores();
    BI.renderTopProdutos();
  },

  renderChartFaturamento() {
    const ctx = document.getElementById('chartFaturamento');
    if (App.charts.faturamento) App.charts.faturamento.destroy();

    App.charts.faturamento = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: DB.faturamento_mensal.map(m => m.mes),
        datasets: [
          {
            label: 'Faturamento',
            data: DB.faturamento_mensal.map(m => m.valor),
            backgroundColor: 'rgba(37,99,235,0.85)',
            borderRadius: 5,
            order: 2,
          },
          {
            label: 'Lucro Líquido',
            data: DB.faturamento_mensal.map(m => m.valor - m.custos - m.despesas),
            type: 'line',
            borderColor: '#22c55e',
            backgroundColor: 'rgba(34,197,94,.15)',
            fill: true,
            tension: 0.4,
            pointBackgroundColor: '#22c55e',
            pointRadius: 4,
            order: 1,
          },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'top', labels: { font: { size: 11 }, boxWidth: 12 } } },
        scales: {
          y: {
            ticks: {
              callback: v => 'R$ ' + (v / 1000).toFixed(0) + 'k',
              font: { size: 11 },
            },
            grid: { color: '#f1f5f9' },
          },
          x: { ticks: { font: { size: 11 } }, grid: { display: false } },
        },
      },
    });
  },

  renderChartCanal() {
    const ctx = document.getElementById('chartCanal');
    if (App.charts.canal) App.charts.canal.destroy();

    const total = DB.canais.interno + DB.canais.externo;
    App.charts.canal = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Canal Interno', 'Canal Externo'],
        datasets: [{
          data: [DB.canais.interno, DB.canais.externo],
          backgroundColor: ['#3b82f6', '#8b5cf6'],
          hoverOffset: 6,
          borderWidth: 0,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        cutout: '68%',
        plugins: { legend: { display: false } },
      },
    });

    document.getElementById('canalLegend').innerHTML = [
      { label: 'Canal Interno', val: DB.canais.interno, cor: '#3b82f6' },
      { label: 'Canal Externo', val: DB.canais.externo, cor: '#8b5cf6' },
    ].map(c => `
      <div class="canal-legend-item">
        <span class="canal-legend-label">
          <span class="canal-legend-dot" style="background:${c.cor}"></span>
          ${c.label}
        </span>
        <span class="canal-legend-val">${fmt.moeda(c.val)}</span>
        <span class="canal-legend-pct">${total ? fmt.pct(c.val / total * 100) : '0,0%'}</span>
      </div>
    `).join('');
  },

  renderChartVendedores() {
    const ctx = document.getElementById('chartVendedores');
    if (App.charts.vendedores) App.charts.vendedores.destroy();

    App.charts.vendedores = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: DB.vendedores.map(v => v.nome.split(' ')[0]),
        datasets: [
          {
            label: 'Realizado',
            data: DB.vendedores.map(v => v.faturamento),
            backgroundColor: '#3b82f6',
            borderRadius: 4,
            barPercentage: 0.55,
          },
          {
            label: 'Meta',
            data: DB.vendedores.map(v => v.meta),
            backgroundColor: '#e2e8f0',
            borderRadius: 4,
            barPercentage: 0.55,
          },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'top', labels: { font: { size: 11 }, boxWidth: 12 } } },
        scales: {
          y: { ticks: { callback: v => 'R$ ' + (v/1000).toFixed(0) + 'k', font: { size: 11 } }, grid: { color: '#f1f5f9' } },
          x: { ticks: { font: { size: 11 } }, grid: { display: false } },
        },
      },
    });
  },

  renderTopProdutos() {
    const t = document.getElementById('topProdutosTable');
    if (!DB.top_produtos.length) {
      t.innerHTML = '<tbody><tr><td colspan="4" style="text-align:center;padding:32px;color:#94a3b8">Sem dados</td></tr></tbody>';
      return;
    }
    t.innerHTML = `
      <thead>
        <tr>
          <th>#</th>
          <th>Produto</th>
          <th>Faturamento</th>
          <th>Share</th>
        </tr>
      </thead>
      <tbody>
        ${DB.top_produtos.map((p, i) => `
          <tr>
            <td>${i + 1}</td>
            <td>${p.produto}</td>
            <td>${fmt.moeda(p.faturamento)}</td>
            <td>
              <div style="display:flex;align-items:center;gap:6px">
                <div class="progress-bar" style="width:60px">
                  <div class="progress-fill" style="width:${p.pct}%;background:#3b82f6"></div>
                </div>
                <span style="font-size:11px;color:#64748b">${p.pct}%</span>
              </div>
            </td>
          </tr>
        `).join('')}
      </tbody>
    `;
  },
};

// ===== FATURAMENTO =====
const Faturamento = {
  dados: [...DB.notas],

  render() {
    const emitidas = DB.notas.filter(n => n.status === 'Emitida');
    const total = emitidas.reduce((s, n) => s + n.valor, 0);
    const externo = emitidas.filter(n => n.canal === 'Externo').reduce((s, n) => s + n.valor, 0);
    const interno = emitidas.filter(n => n.canal === 'Interno').reduce((s, n) => s + n.valor, 0);
    const ticket = emitidas.length ? total / emitidas.length : 0;

    document.getElementById('fat-total').textContent = fmt.moeda(total);
    document.getElementById('fat-count').textContent = `${emitidas.length} notas`;
    document.getElementById('fat-ticket').textContent = fmt.moeda(ticket);
    document.getElementById('fat-externo').textContent = fmt.moeda(externo);
    document.getElementById('fat-externo-pct').textContent = total ? `${fmt.pct(externo / total * 100)} do total` : '0,0% do total';
    document.getElementById('fat-interno').textContent = fmt.moeda(interno);
    document.getElementById('fat-interno-pct').textContent = total ? `${fmt.pct(interno / total * 100)} do total` : '0,0% do total';

    Faturamento.filter();
  },

  filter() {
    const q = (document.getElementById('fatSearch')?.value || '').toLowerCase();
    const canal = document.getElementById('fatCanal')?.value || '';
    const status = document.getElementById('fatStatus')?.value || '';

    const filtrado = DB.notas.filter(n =>
      (!q || n.id.toLowerCase().includes(q) || n.cliente.toLowerCase().includes(q) || n.vendedor.toLowerCase().includes(q)) &&
      (!canal || n.canal === canal) &&
      (!status || n.status === status)
    );

    const tbody = document.getElementById('fatTableBody');
    tbody.innerHTML = filtrado.length ? filtrado.map(n => `
      <tr>
        <td><strong>${n.id}</strong></td>
        <td>${n.cliente}</td>
        <td>${fmt.data(n.data)}</td>
        <td>${canalBadge(n.canal)}</td>
        <td>${n.vendedor}</td>
        <td><strong>${fmt.moeda(n.valor)}</strong></td>
        <td>${statusBadge(n.status)}</td>
        <td>
          <div class="actions">
            <button class="btn btn-sm btn-secondary" title="Ver detalhes">&#128065;</button>
            <button class="btn btn-sm btn-danger" title="Cancelar">&#10005;</button>
          </div>
        </td>
      </tr>
    `).join('') : `<tr><td colspan="8" style="text-align:center;padding:32px;color:#94a3b8">Nenhuma nota encontrada</td></tr>`;
  },

  openModal(nota) {
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('fat-nf-data').value = today;
    document.getElementById('modalFatTitle').textContent = nota ? 'Editar Nota Fiscal' : 'Nova Nota Fiscal';
    document.getElementById('modalFaturamento').classList.add('open');
  },

  save() {
    const nota = {
      id: document.getElementById('fat-nf-num').value || `NF-${String(DB.notas.length + 1).padStart(6,'0')}`,
      cliente: document.getElementById('fat-nf-cliente').value || 'Cliente não informado',
      data: document.getElementById('fat-nf-data').value,
      canal: document.getElementById('fat-nf-canal').value,
      vendedor: document.getElementById('fat-nf-vendedor').value,
      valor: parseFloat(document.getElementById('fat-nf-valor').value) || 0,
      status: document.getElementById('fat-nf-status').value,
    };
    DB.notas.unshift(nota);
    closeModal('modalFaturamento');
    Faturamento.render();
    App.updateBadges();
  },
};

// ===== PCP =====
const PCP = {
  render() {
    const porStatus = s => DB.ordens.filter(o => o.status === s).length;
    const atrasadas = DB.ordens.filter(o =>
      ['Aguardando','Em Produção'].includes(o.status) && fmt.atrasada(o.previsao)
    ).length;

    document.getElementById('pcp-aguardando').textContent = porStatus('Aguardando');
    document.getElementById('pcp-producao').textContent = porStatus('Em Produção');
    document.getElementById('pcp-prontos').textContent = porStatus('Pronto');
    document.getElementById('pcp-atrasadas').textContent = atrasadas;

    const sel = document.getElementById('pcpMaquina');
    if (sel && sel.options.length === 1) {
      DB.maquinas.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m.nome; opt.textContent = m.nome;
        sel.appendChild(opt);
      });
    }

    PCP.filter();
  },

  filter() {
    const q = (document.getElementById('pcpSearch')?.value || '').toLowerCase();
    const status = document.getElementById('pcpStatus')?.value || '';
    const maquina = document.getElementById('pcpMaquina')?.value || '';

    const filtrado = DB.ordens.filter(o =>
      (!q || o.op.toLowerCase().includes(q) || o.cliente.toLowerCase().includes(q) || o.produto.toLowerCase().includes(q)) &&
      (!status || o.status === status) &&
      (!maquina || o.maquina === maquina)
    );

    const tbody = document.getElementById('pcpTableBody');
    tbody.innerHTML = filtrado.map(o => {
      const atrasada = fmt.atrasada(o.previsao) && ['Aguardando','Em Produção'].includes(o.status);
      return `
        <tr style="${atrasada ? 'background:#fff7f7' : ''}">
          <td><strong>${o.op}</strong> ${atrasada ? '<span class="badge badge-red" style="font-size:9px">Atrasada</span>' : ''}</td>
          <td>${o.cliente}</td>
          <td style="max-width:220px">${o.produto}</td>
          <td>${fmt.num(o.qtd)}</td>
          <td>${fmt.data(o.entrada)}</td>
          <td style="color:${atrasada?'#dc2626':'inherit'};font-weight:${atrasada?'600':'400'}">${fmt.data(o.previsao)}</td>
          <td><span class="badge badge-gray">${o.maquina}</span></td>
          <td>${statusBadge(o.status)}</td>
          <td>
            <div class="actions">
              <button class="btn btn-sm btn-secondary" title="Editar">&#9998;</button>
              <button class="btn btn-sm btn-primary" onclick="PCP.avancarStatus('${o.op}')" title="Avançar status">&#8594;</button>
            </div>
          </td>
        </tr>
      `;
    }).join('') || `<tr><td colspan="9" style="text-align:center;padding:32px;color:#94a3b8">Nenhuma ordem encontrada</td></tr>`;
  },

  avancarStatus(op) {
    const o = DB.ordens.find(x => x.op === op);
    if (!o) return;
    const fluxo = ['Aguardando','Em Produção','Pronto','Entregue'];
    const idx = fluxo.indexOf(o.status);
    if (idx < fluxo.length - 1) o.status = fluxo[idx + 1];
    PCP.render();
    App.updateBadges();
  },

  openModal() {
    const hoje = new Date().toISOString().split('T')[0];
    document.getElementById('pcp-op-entrada').value = hoje;
    document.getElementById('modalPCP').classList.add('open');
  },

  save() {
    const ordemNum = `OP-2026-0${String(DB.ordens.length + 460).padStart(3,'0')}`;
    const o = {
      op: document.getElementById('pcp-op-num').value || ordemNum,
      cliente: document.getElementById('pcp-op-cliente').value || 'Cliente',
      produto: document.getElementById('pcp-op-produto').value || 'Produto',
      qtd: parseInt(document.getElementById('pcp-op-qtd').value) || 0,
      entrada: document.getElementById('pcp-op-entrada').value,
      previsao: document.getElementById('pcp-op-previsao').value,
      maquina: document.getElementById('pcp-op-maquina').value,
      status: document.getElementById('pcp-op-status').value,
      prioridade: 'Normal',
    };
    DB.ordens.unshift(o);
    closeModal('modalPCP');
    PCP.render();
    App.updateBadges();
  },
};

// ===== MÁQUINAS =====
const Maquinas = {
  render() {
    Maquinas.renderCards();
    Maquinas.renderSchedule();
    Maquinas.renderQueues();
  },

  renderCards() {
    const el = document.getElementById('machineOverview');
    if (!DB.maquinas.length) {
      el.innerHTML = '<p class="empty-state" style="padding:32px;color:#94a3b8;text-align:center">Nenhuma máquina cadastrada ainda.</p>';
      return;
    }
    el.innerHTML = DB.maquinas.map(m => {
      const statusClass = `status-${m.status.toLowerCase().replace(' ','')}`;
      const opAtual = DB.ordens.find(o => o.op === m.op_atual);
      return `
        <div class="machine-card ${statusClass}">
          <div class="machine-card-name">${m.nome}</div>
          <div class="machine-card-type">${m.tipo}</div>
          <div>${statusBadge(m.status)}</div>
          <div class="machine-card-op" style="margin-top:8px">
            ${m.op_atual
              ? `OP: <span>${m.op_atual}</span><br><span style="color:#64748b;font-size:10px">${opAtual?.cliente || ''}</span>`
              : '<span style="color:#94a3b8">Sem OP alocada</span>'
            }
          </div>
          ${m.status === 'Rodando' ? `
            <div class="machine-eff-bar">
              <div class="machine-eff-fill" style="width:${m.eficiencia}%"></div>
            </div>
            <div class="machine-eff-label">Eficiência: ${m.eficiencia}%</div>
          ` : ''}
        </div>
      `;
    }).join('');
  },

  renderSchedule() {
    const dias = ['Segunda 12/05','Terça 13/05','Quarta 14/05','Quinta 15/05','Sexta 16/05'];
    const schedule = {
      'Flexográfica 1':   ['OP-2026-0458','OP-2026-0458','OP-2026-0460','OP-2026-0460','—'],
      'Flexográfica 2':   ['Setup','OP-2026-0461','OP-2026-0461','OP-2026-0461','—'],
      'Impressora Digital':['OP-2026-0462','—','—','—','—'],
      'Plotter de Corte': ['—','OP-2026-0460','OP-2026-0461','—','—'],
      'Laminadora':       ['OP-2026-0455','—','OP-2026-0460','—','—'],
      'Rebobinadeira':    ['Manutenção','Manutenção','—','—','—'],
    };

    document.getElementById('scheduleHeader').innerHTML = `
      <tr>
        <th>Máquina</th>
        ${dias.map(d => `<th>${d}</th>`).join('')}
      </tr>
    `;
    document.getElementById('scheduleBody').innerHTML = Object.entries(schedule).map(([maq, ops]) => `
      <tr>
        <td><strong>${maq}</strong></td>
        ${ops.map(op => {
          let cls = 'free';
          if (op.startsWith('OP')) cls = 'busy';
          else if (op === 'Setup') cls = 'setup-cell';
          else if (op === 'Manutenção') cls = 'manut-cell';
          return `<td><span class="schedule-cell ${cls}">${op}</span></td>`;
        }).join('')}
      </tr>
    `).join('');
  },

  renderQueues() {
    const filas = {};
    DB.maquinas.forEach(m => { filas[m.nome] = []; });
    DB.ordens.filter(o => ['Aguardando','Em Produção'].includes(o.status)).forEach(o => {
      if (filas[o.maquina]) filas[o.maquina].push(o);
    });

    const filasComOPs = Object.entries(filas).filter(([, ops]) => ops.length > 0);
    const el = document.getElementById('machineQueues');
    if (!filasComOPs.length) {
      el.innerHTML = '<p class="empty-state" style="padding:32px;color:#94a3b8;text-align:center">Nenhuma ordem em fila no momento.</p>';
      return;
    }
    el.innerHTML = filasComOPs
      .map(([maq, ops]) => `
        <div class="queue-card">
          <div class="queue-card-title">
            ${maq}
            <span class="badge badge-blue">${ops.length} OPs</span>
          </div>
          ${ops.map(o => `
            <div class="queue-item">
              <div>
                <div class="queue-item-op">${o.op}</div>
                <div class="queue-item-client">${o.cliente}</div>
              </div>
              <div style="text-align:right">
                ${statusBadge(o.status)}
                <div style="font-size:10px;color:#64748b;margin-top:2px">Prev: ${fmt.data(o.previsao)}</div>
              </div>
            </div>
          `).join('')}
        </div>
      `).join('');
  },
};

// ===== ORÇAMENTOS =====
const Orcamentos = {
  view: 'kanban',
  draggingId: null,
  editingId: null,

  COLUNAS: [
    { status: 'Gerado',        label: 'ORÇAMENTOS GERADOS', cor: '#3b82f6', corLight: '#dbeafe' },
    { status: 'Revisão',       label: 'PARA REVISÃO',       cor: '#f59e0b', corLight: '#fef3c7' },
    { status: 'Em Negociação', label: 'EM NEGOCIAÇÃO',      cor: '#8b5cf6', corLight: '#ede9fe' },
    { status: 'Fechado',       label: 'FECHADOS',           cor: '#22c55e', corLight: '#dcfce7' },
    { status: 'Perdido',       label: 'PERDIDOS',           cor: '#ef4444', corLight: '#fee2e2' },
  ],

  render() {
    this._renderKPIs();
    this._renderCharts();
    if (this.view === 'kanban') this.renderKanban();
    else this.renderLista();
  },

  _renderKPIs() {
    const abertos  = DB.orcamentos.filter(o => !['Fechado','Perdido'].includes(o.status));
    const fechados = DB.orcamentos.filter(o => o.status === 'Fechado');
    const negoc    = DB.orcamentos.filter(o => o.status === 'Em Negociação');
    const total    = DB.orcamentos.length;
    const soma     = arr => arr.reduce((s,o) => s + o.qtd * o.preco_unit, 0);
    const conv     = total ? (fechados.length / total * 100).toFixed(1) : 0;
    const ticket   = total ? soma(DB.orcamentos) / total : 0;
    // margem média ponderada por valor
    const totalVal   = DB.orcamentos.reduce((s,o) => s + o.qtd * o.preco_unit, 0);
    const totalCusto = DB.orcamentos.reduce((s,o) => s + o.qtd * o.custo_unit, 0);
    const margemMedia = totalVal > 0 ? ((totalVal - totalCusto) / totalVal * 100) : 0;
    const mi = margemInfo(margemMedia);

    document.getElementById('orc-em-aberto').textContent      = abertos.length;
    document.getElementById('orc-em-aberto-val').textContent   = fmt.moeda(soma(abertos));
    document.getElementById('orc-conversao').textContent      = conv + '%';
    document.getElementById('orc-conversao-info').textContent = `${fechados.length} fechados de ${total}`;
    document.getElementById('orc-pendentes').textContent      = negoc.length;
    // Ticket médio alimenta o BI Dashboard
    const elTicketBI = document.getElementById('kpi-orc-ticket');
    if (elTicketBI) elTicketBI.textContent = fmt.moeda(ticket);
    const elTicketDelta = document.getElementById('kpi-orc-ticket-delta');
    if (elTicketDelta) elTicketDelta.textContent = `${total} orçamento${total !== 1 ? 's' : ''}`;
    const elMargem = document.getElementById('orc-margem-media');
    if (elMargem) { elMargem.textContent = fmt.pct(margemMedia); elMargem.style.color = mi.cor; }
    const elMargemInfo = document.getElementById('orc-margem-media-info');
    if (elMargemInfo) { elMargemInfo.textContent = mi.label; elMargemInfo.style.color = mi.cor; }
  },

  _renderCharts() {
    const ctx1 = document.getElementById('chartOrcVendedor');
    if (ctx1) {
      if (App.charts.orcVendedor) App.charts.orcVendedor.destroy();
      const vendedores = ['Carlos Silva','Ana Costa','Roberto Lima','Mariana Santos','Canal Interno'];
      const cores = ['#3b82f6','#8b5cf6','#22c55e','#f59e0b','#64748b'];
      App.charts.orcVendedor = new Chart(ctx1, {
        type: 'bar',
        data: {
          labels: vendedores.map(v => v.split(' ')[0]),
          datasets: [{ label: 'Valor (R$)', data: vendedores.map(v => DB.orcamentos.filter(o => o.responsavel === v).reduce((s,o) => s + o.qtd * o.preco_unit, 0)), backgroundColor: cores, borderRadius: 6 }],
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { ticks: { callback: v => 'R$'+(v/1000).toFixed(0)+'k', font:{size:11} }, grid:{color:'#f1f5f9'} }, x: { ticks:{font:{size:11}}, grid:{display:false} } } },
      });
    }
    const ctx2 = document.getElementById('chartOrcCanal');
    if (ctx2) {
      if (App.charts.orcCanal) App.charts.orcCanal.destroy();
      const interno = DB.orcamentos.filter(o => o.canal === 'Interno').reduce((s,o) => s + o.qtd * o.preco_unit, 0);
      const externo = DB.orcamentos.filter(o => o.canal === 'Externo').reduce((s,o) => s + o.qtd * o.preco_unit, 0);
      const totalC = interno + externo;
      App.charts.orcCanal = new Chart(ctx2, {
        type: 'doughnut',
        data: { labels: ['Interno','Externo'], datasets: [{ data: [interno, externo], backgroundColor: ['#3b82f6','#8b5cf6'], borderWidth: 0, hoverOffset: 4 }] },
        options: { responsive: true, maintainAspectRatio: false, cutout: '68%', plugins: { legend: { display: false } } },
      });
      document.getElementById('orcCanalLegend').innerHTML = [
        { label: 'Canal Interno', val: interno, cor: '#3b82f6' },
        { label: 'Canal Externo', val: externo, cor: '#8b5cf6' },
      ].map(c => `<div class="canal-legend-item"><span class="canal-legend-label"><span class="canal-legend-dot" style="background:${c.cor}"></span>${c.label}</span><span class="canal-legend-val">${fmt.moeda(c.val)}</span><span class="canal-legend-pct">${fmt.pct(totalC ? c.val/totalC*100 : 0)}</span></div>`).join('');
    }
    const ctx3 = document.getElementById('chartOrcConversao');
    if (ctx3) {
      if (App.charts.orcConversao) App.charts.orcConversao.destroy();
      App.charts.orcConversao = new Chart(ctx3, {
        type: 'bar',
        data: {
          labels: ['Jan/26','Fev/26','Mar/26','Abr/26','Mai/26'],
          datasets: [
            { label: 'Gerados',  data: [8,12,10,15,DB.orcamentos.length], backgroundColor: '#93c5fd', borderRadius: 4 },
            { label: 'Fechados', data: [5,8,7,10,DB.orcamentos.filter(o=>o.status==='Fechado').length], backgroundColor: '#22c55e', borderRadius: 4 },
            { label: 'Perdidos', data: [2,3,2,4,DB.orcamentos.filter(o=>o.status==='Perdido').length], backgroundColor: '#fca5a5', borderRadius: 4 },
          ],
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position:'top', labels:{font:{size:10},boxWidth:10} } }, scales: { y:{ticks:{font:{size:11}},grid:{color:'#f1f5f9'}}, x:{ticks:{font:{size:11}},grid:{display:false}} } },
      });
    }
  },

  setView(v) {
    this.view = v;
    document.getElementById('orcKanban').style.display = v === 'kanban' ? 'flex' : 'none';
    document.getElementById('orcLista').style.display  = v === 'lista'  ? 'block' : 'none';
    document.getElementById('btnKanban').classList.toggle('active', v === 'kanban');
    document.getElementById('btnLista').classList.toggle('active',  v === 'lista');
    if (v === 'kanban') this.renderKanban(); else this.renderLista();
  },

  filter() { if (this.view === 'kanban') this.renderKanban(); else this.renderLista(); },

  _getFiltered() {
    const q  = (document.getElementById('orcSearch')?.value || '').toLowerCase();
    const vd = document.getElementById('orcFilterVendedor')?.value || '';
    const cn = document.getElementById('orcFilterCanal')?.value || '';
    return DB.orcamentos.filter(o =>
      (!q  || o.cliente.toLowerCase().includes(q) || o.produto.toLowerCase().includes(q) || o.id.toLowerCase().includes(q)) &&
      (!vd || o.responsavel === vd) && (!cn || o.canal === cn)
    );
  },

  renderKanban() {
    const board = document.getElementById('orcKanban');
    const filtered = this._getFiltered();
    board.innerHTML = this.COLUNAS.map(col => {
      const cards  = filtered.filter(o => o.status === col.status);
      const totalV = cards.reduce((s,o) => s + o.qtd * o.preco_unit, 0);
      return `
        <div class="kanban-col"
          ondragover="event.preventDefault();this.querySelector('.kanban-col-body').classList.add('drag-over')"
          ondragleave="this.querySelector('.kanban-col-body').classList.remove('drag-over')"
          ondrop="Orcamentos.onDrop(event,'${col.status}')">
          <div class="kanban-col-header" style="border-top:3px solid ${col.cor}">
            <div class="kanban-col-title">${col.label}</div>
            <div class="kanban-col-meta">
              <span class="kanban-col-count" style="background:${col.corLight};color:${col.cor}">${cards.length}</span>
              <span class="kanban-col-val">${fmt.moeda(totalV)}</span>
            </div>
          </div>
          <div class="kanban-col-body">
            ${cards.length ? cards.map(o => this._card(o, col)).join('') : '<div class="kanban-empty">Arraste um card aqui</div>'}
          </div>
        </div>`;
    }).join('');
  },

  _card(o, col) {
    const valor     = o.qtd * o.preco_unit;
    const margem    = ((o.preco_unit - o.custo_unit) / o.preco_unit * 100);
    const dias      = Math.floor((new Date() - new Date(o.criado)) / 86400000);
    const vencida   = new Date(o.validade) < new Date() && !['Fechado','Perdido'].includes(o.status);
    const mCor      = margemInfo(margem).cor;
    const nextCols  = this.COLUNAS.filter(c => c.status !== o.status);
    return `
      <div class="kanban-card${vencida?' vencida':''}"
        draggable="true"
        ondragstart="Orcamentos.onDragStart(event,'${o.id}')"
        ondragend="document.querySelectorAll('.kanban-col-body').forEach(el=>el.classList.remove('drag-over'))">
        <div class="kanban-card-header">
          <span class="kanban-card-id">${o.id}</span>
          <span style="font-size:11px">${o.canal==='Externo'?'🌐':'🏭'}</span>
        </div>
        <div class="kanban-card-client">${o.cliente}</div>
        <div class="kanban-card-product" title="${o.produto}">${o.produto}</div>
        <div class="kanban-card-footer">
          <div class="kanban-card-value">${fmt.moeda(valor)}</div>
          <div class="kanban-card-margem" style="color:${mCor}">▲${fmt.pct(margem)}</div>
        </div>
        <div class="kanban-card-meta">
          <span>👤 ${o.responsavel.split(' ')[0]}</span>
          <span${vencida?' style="color:#ef4444;font-weight:600"':''}>📅 ${vencida?'⚠ Vencida':dias+'d atrás'}</span>
        </div>
        <div class="kanban-card-btns">
          <button class="kanban-card-detail-btn" onclick="Orcamentos.openModal('${o.id}')">&#128065; Ver / Editar</button>
          <div class="kanban-card-move">
            ${nextCols.map(c=>`<button class="kanban-move-btn" onclick="Orcamentos.mover('${o.id}','${c.status}')" style="background:${c.corLight};color:${c.cor}">${c.status==='Fechado'?'✓ Fechar':c.status==='Perdido'?'✗ Perder':'→ '+c.status}</button>`).join('')}
          </div>
        </div>
      </div>`;
  },

  onDragStart(e, id) {
    this.draggingId = id;
    e.dataTransfer.effectAllowed = 'move';
    e.currentTarget.classList.add('dragging');
  },

  onDrop(e, status) {
    e.preventDefault();
    e.currentTarget.querySelector('.kanban-col-body').classList.remove('drag-over');
    if (this.draggingId) { this.mover(this.draggingId, status); this.draggingId = null; }
  },

  mover(id, novoStatus) {
    const o = DB.orcamentos.find(x => x.id === id);
    if (o) { o.status = novoStatus; Firebase.updateOrcamentoStatus(id, novoStatus).catch(console.error); this.render(); App.updateBadges(); }
  },

  renderLista() {
    const tbody = document.getElementById('orcTableBody');
    tbody.innerHTML = this._getFiltered().map(o => {
      const val    = o.qtd * o.preco_unit;
      const margem = ((o.preco_unit - o.custo_unit) / o.preco_unit) * 100;
      const mCls   = margemInfo(margem).cls;
      const vencida = new Date(o.validade) < new Date() && !['Fechado','Perdido'].includes(o.status);
      return `
        <tr style="${vencida?'background:#fff7f7':''}">
          <td><strong>${o.id}</strong>${vencida?' <span class="badge badge-red" style="font-size:9px">Vencida</span>':''}</td>
          <td>${o.cliente}</td>
          <td style="max-width:200px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${o.produto}</td>
          <td>${fmt.num(o.qtd)}</td><td><strong>${fmt.moeda(val)}</strong></td>
          <td><div class="margem-bar"><div class="margem-fill ${mCls}" style="width:${Math.min(margem,60)}px"></div><span class="margem-val" style="color:${margemInfo(margem).cor}">${fmt.pct(margem)}</span></div></td>
          <td>${o.responsavel}</td>
          <td style="color:${vencida?'#dc2626':'inherit'}">${fmt.data(o.validade)}</td>
          <td>${statusBadge(o.status)}</td>
          <td><div class="actions">
            <button class="btn btn-sm btn-secondary" onclick="Orcamentos.openModal('${o.id}')">&#128065;</button>
            <button class="btn btn-sm btn-primary"   onclick="Orcamentos.mover('${o.id}','Fechado')" title="Fechar">&#10003;</button>
            <button class="btn btn-sm btn-danger"    onclick="Orcamentos.mover('${o.id}','Perdido')" title="Perder">&#10005;</button>
          </div></td>
        </tr>`;
    }).join('') || `<tr><td colspan="10" style="text-align:center;padding:32px;color:#94a3b8">Nenhum orçamento encontrado</td></tr>`;
  },

  calcular() {
    const qtd   = parseFloat(document.getElementById('orc-qtd').value)   || 0;
    const custo = parseFloat(document.getElementById('orc-custo').value) || 0;
    const preco = parseFloat(document.getElementById('orc-preco').value) || 0;
    const margem = preco > 0 ? ((preco - custo) / preco * 100) : 0;
    document.getElementById('calc-total').textContent  = fmt.moeda(qtd * preco);
    document.getElementById('calc-custo').textContent  = fmt.moeda(qtd * custo);
    document.getElementById('calc-margem').textContent = fmt.pct(margem);
    document.getElementById('calc-margem').style.color = margemInfo(margem).cor;
  },

  openModal(id) {
    const hoje = new Date().toISOString().split('T')[0];
    const d15  = new Date(Date.now() + 15 * 86400000).toISOString().split('T')[0];
    this.editingId = id || null;
    if (id) {
      const o = DB.orcamentos.find(x => x.id === id);
      if (o) {
        document.getElementById('modalOrcTitle').textContent = 'Orçamento ' + o.id;
        document.getElementById('orc-num').value        = o.id;
        document.getElementById('orc-data').value       = o.criado;
        document.getElementById('orc-cliente').value    = o.cliente;
        document.getElementById('orc-produto').value    = o.produto;
        document.getElementById('orc-qtd').value        = o.qtd;
        document.getElementById('orc-custo').value      = o.custo_unit;
        document.getElementById('orc-preco').value      = o.preco_unit;
        document.getElementById('orc-validade').value   = o.validade;
        document.getElementById('orc-canal').value      = o.canal || 'Externo';
        document.getElementById('orc-responsavel').value= o.responsavel;
        document.getElementById('orc-status').value     = o.status;
        document.getElementById('orc-obs').value        = o.obs || '';
        this.calcular();
      }
    } else {
      document.getElementById('modalOrcTitle').textContent = 'Novo Orçamento';
      ['orc-num','orc-cliente','orc-produto','orc-qtd','orc-custo','orc-preco','orc-obs'].forEach(fid => { document.getElementById(fid).value = ''; });
      document.getElementById('orc-data').value     = hoje;
      document.getElementById('orc-validade').value = d15;
      document.getElementById('orc-status').value   = 'Gerado';
      document.getElementById('orc-canal').value    = 'Externo';
      document.getElementById('calc-total').textContent = document.getElementById('calc-custo').textContent = 'R$ 0,00';
      document.getElementById('calc-margem').textContent = '0%';
    }
    document.getElementById('modalOrcamento').classList.add('open');
  },

  save() {
    const qtd   = parseInt(document.getElementById('orc-qtd').value)    || 0;
    const custo = parseFloat(document.getElementById('orc-custo').value) || 0;
    const preco = parseFloat(document.getElementById('orc-preco').value) || 0;
    if (this.editingId) {
      const o = DB.orcamentos.find(x => x.id === this.editingId);
      if (o) {
        o.cliente     = document.getElementById('orc-cliente').value    || o.cliente;
        o.produto     = document.getElementById('orc-produto').value    || o.produto;
        o.qtd         = qtd        || o.qtd;
        o.custo_unit  = custo      || o.custo_unit;
        o.preco_unit  = preco      || o.preco_unit;
        o.validade    = document.getElementById('orc-validade').value;
        o.canal       = document.getElementById('orc-canal').value;
        o.responsavel = document.getElementById('orc-responsavel').value;
        o.status      = document.getElementById('orc-status').value;
        o.obs         = document.getElementById('orc-obs').value;
      }
    } else {
      DB.orcamentos.unshift({
        id:          document.getElementById('orc-num').value || `ORC-2026-0${String(DB.orcamentos.length + 90).padStart(3,'0')}`,
        cliente:     document.getElementById('orc-cliente').value    || 'Cliente',
        produto:     document.getElementById('orc-produto').value    || 'Produto',
        qtd, custo_unit: custo, preco_unit: preco,
        criado:      document.getElementById('orc-data').value,
        validade:    document.getElementById('orc-validade').value,
        status:      document.getElementById('orc-status').value     || 'Gerado',
        canal:       document.getElementById('orc-canal').value      || 'Externo',
        responsavel: document.getElementById('orc-responsavel').value,
        obs:         document.getElementById('orc-obs').value,
      });
    }
    closeModal('modalOrcamento');
    this.render();
    App.updateBadges();
  },

  // legacy stubs mantidos para compatibilidade
  render_legacy() {
    const total = DB.orcamentos.length;
    const analise = DB.orcamentos.filter(o => o.status === 'Em Análise');
    const aprovados = DB.orcamentos.filter(o => o.status === 'Aprovado');
    const reprovados = DB.orcamentos.filter(o => o.status === 'Reprovado');
    const soma = arr => arr.reduce((s, o) => s + o.qtd * o.preco_unit, 0);
    const taxa = total ? ((aprovados.length / total) * 100).toFixed(1) : 0;

    document.getElementById('orc-analise').textContent = analise.length;
    document.getElementById('orc-analise-val').textContent = fmt.moeda(soma(analise));
    document.getElementById('orc-aprovado').textContent = aprovados.length;
    document.getElementById('orc-aprovado-val').textContent = fmt.moeda(soma(aprovados));
    document.getElementById('orc-reprovado').textContent = reprovados.length;
    document.getElementById('orc-reprovado-val').textContent = fmt.moeda(soma(reprovados));
    document.getElementById('orc-taxa').textContent = taxa + '%';

    Orcamentos.filter();
  },

  filter() {
    const q = (document.getElementById('orcSearch')?.value || '').toLowerCase();
    const status = document.getElementById('orcStatus')?.value || '';

    const filtrado = DB.orcamentos.filter(o =>
      (!q || o.cliente.toLowerCase().includes(q) || o.produto.toLowerCase().includes(q) || o.id.toLowerCase().includes(q)) &&
      (!status || o.status === status)
    );

    const tbody = document.getElementById('orcTableBody');
    tbody.innerHTML = filtrado.map(o => {
      const valorTotal = o.qtd * o.preco_unit;
      const margem = ((o.preco_unit - o.custo_unit) / o.preco_unit) * 100;
      const margemCls = margem >= 35 ? '' : margem >= 25 ? 'mid' : 'low';
      const vencida = new Date(o.validade) < new Date() && o.status === 'Em Análise';
      return `
        <tr style="${vencida ? 'background:#fff7f7' : ''}">
          <td><strong>${o.id}</strong>${vencida ? ' <span class="badge badge-red" style="font-size:9px">Vencida</span>' : ''}</td>
          <td>${o.cliente}</td>
          <td style="max-width:200px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${o.produto}</td>
          <td>${fmt.num(o.qtd)}</td>
          <td><strong>${fmt.moeda(valorTotal)}</strong></td>
          <td>
            <div class="margem-bar">
              <div class="margem-fill ${margemCls}" style="width:${Math.min(margem,60)}px"></div>
              <span class="margem-val" style="color:${margem>=35?'#16a34a':margem>=25?'#d97706':'#dc2626'}">${fmt.pct(margem)}</span>
            </div>
          </td>
          <td>${o.responsavel}</td>
          <td style="color:${vencida?'#dc2626':'inherit'}">${fmt.data(o.validade)}</td>
          <td>${statusBadge(o.status)}</td>
          <td>
            <div class="actions">
              <button class="btn btn-sm btn-secondary" title="Ver">&#128065;</button>
              <button class="btn btn-sm btn-primary" onclick="Orcamentos.aprovar('${o.id}')" title="Aprovar">&#10003;</button>
              <button class="btn btn-sm btn-danger" onclick="Orcamentos.reprovar('${o.id}')" title="Reprovar">&#10005;</button>
            </div>
          </td>
        </tr>
      `;
    }).join('') || `<tr><td colspan="10" style="text-align:center;padding:32px;color:#94a3b8">Nenhum orçamento encontrado</td></tr>`;
  },

  calcular() {
    const qtd = parseFloat(document.getElementById('orc-qtd').value) || 0;
    const custo = parseFloat(document.getElementById('orc-custo').value) || 0;
    const preco = parseFloat(document.getElementById('orc-preco').value) || 0;
    const total = qtd * preco;
    const custoTotal = qtd * custo;
    const margem = preco > 0 ? ((preco - custo) / preco * 100) : 0;
    document.getElementById('calc-total').textContent = fmt.moeda(total);
    document.getElementById('calc-custo').textContent = fmt.moeda(custoTotal);
    document.getElementById('calc-margem').textContent = fmt.pct(margem);
    document.getElementById('calc-margem').style.color = margemInfo(margem).cor;
  },

  openModal(orc) {
    const hoje = new Date().toISOString().split('T')[0];
    const daqui15 = new Date(Date.now() + 15 * 86400000).toISOString().split('T')[0];
    document.getElementById('orc-data').value = hoje;
    document.getElementById('orc-validade').value = daqui15;
    document.getElementById('modalOrcTitle').textContent = orc ? 'Editar Orçamento' : 'Novo Orçamento';
    document.getElementById('modalOrcamento').classList.add('open');
  },

  save() {
    const qtd = parseInt(document.getElementById('orc-qtd').value) || 0;
    const custo = parseFloat(document.getElementById('orc-custo').value) || 0;
    const preco = parseFloat(document.getElementById('orc-preco').value) || 0;
    const o = {
      id: document.getElementById('orc-num').value || `ORC-2026-0${String(DB.orcamentos.length + 90).padStart(3,'0')}`,
      cliente: document.getElementById('orc-cliente').value || 'Cliente',
      produto: document.getElementById('orc-produto').value || 'Produto',
      qtd, custo_unit: custo, preco_unit: preco,
      criado: document.getElementById('orc-data').value,
      validade: document.getElementById('orc-validade').value,
      status: document.getElementById('orc-status').value,
      responsavel: document.getElementById('orc-responsavel').value,
    };
    DB.orcamentos.unshift(o);
    closeModal('modalOrcamento');
    Orcamentos.render();
    App.updateBadges();
  },

};

// ===== CAMPOS PADRÃO =====
const CAMPOS_COMUNS = [
  { id:'cc-titulo',        label:'Título',                        tipo:'text',   obrigatorio:true  },
  { id:'cc-largura',       label:'Largura mm',                    tipo:'number', obrigatorio:true  },
  { id:'cc-altura',        label:'Altura mm',                     tipo:'number', obrigatorio:true  },
  { id:'cc-carreiras',     label:'Carreiras',                     tipo:'number', obrigatorio:true  },
  { id:'cc-espaco',        label:'Espaço entre carreiras mm',     tipo:'number', obrigatorio:false },
  { id:'cc-faca',          label:'Formato da faca',               tipo:'text',   obrigatorio:false },
  { id:'cc-sugestao-faca', label:'Aceita sugestão de faca',       tipo:'select', opcoes:['Sim','Não'],                                              obrigatorio:true  },
  { id:'cc-verniz',        label:'Verniz',                        tipo:'select', opcoes:['Localizado','Total','Sem Verniz'],                        obrigatorio:true  },
  { id:'cc-laminacao',     label:'Laminação',                     tipo:'select', opcoes:['Brilho','Fosco','Sem Laminação'],                         obrigatorio:true  },
  { id:'cc-pos-imp',       label:'Pós impressão',                 tipo:'select', opcoes:['Ribbon','Inkjet','Datador','Caneta','Sem Pós Impressão'], obrigatorio:true  },
  { id:'cc-imp-cola',      label:'Impressão na cola',             tipo:'select', opcoes:['Sim','Não'],                                              obrigatorio:true  },
  { id:'cc-aplic-auto',    label:'Aplicação automática',          tipo:'select', opcoes:['Sim','Não'],                                              obrigatorio:true  },
  { id:'cc-tubete',        label:'Tamanho do tubete',             tipo:'select', opcoes:['1"','1,5"','3"'],                                         obrigatorio:true  },
  { id:'cc-qtd-rolo',      label:'Quantidade por rolo',           tipo:'number', obrigatorio:false },
  { id:'cc-unidade',       label:'Unidade de medida',             tipo:'select', opcoes:['Milheiro','Rolo'],                                        obrigatorio:true  },
];

const CAMPOS_QTDS = [
  { id:'cq-qtd1', label:'Qtd 1',               tipo:'number', obrigatorio:true  },
  { id:'cq-ent1', label:'Intervalo entregas 1', tipo:'text',   obrigatorio:true  },
  { id:'cq-qtd2', label:'Qtd 2',               tipo:'number', obrigatorio:false },
  { id:'cq-ent2', label:'Intervalo entregas 2', tipo:'text',   obrigatorio:false },
  { id:'cq-qtd3', label:'Qtd 3',               tipo:'number', obrigatorio:false },
  { id:'cq-ent3', label:'Intervalo entregas 3', tipo:'text',   obrigatorio:false },
];

const CAMPOS_COMERCIAIS = [
  { id:'com-trib',     label:'Tributação',           tipo:'select',   opcoes:['Uso e Consumo','Benefício Têxtil 3%','Industrialização'], obrigatorio:true  },
  { id:'com-frete',    label:'Frete',                tipo:'select',   opcoes:['CIF','FOB'],                                              obrigatorio:true  },
  { id:'com-cond',     label:'Condição de pagamento', tipo:'text',     obrigatorio:true  },
  { id:'com-custo',    label:'Custo unitário R$',    tipo:'number',   step:'0.0001',  obrigatorio:true  },
  { id:'com-preco',    label:'Preço unitário R$',    tipo:'number',   step:'0.0001',  obrigatorio:true  },
  { id:'com-obs',      label:'Observações',          tipo:'textarea', obrigatorio:false },
];

// ===== FIREBASE =====
const Firebase = {
  currentUser:     null,
  currentPerms:    {},
  currentUserData: null,

  // Helper: rejeita após ms milissegundos
  _withTimeout(promise, ms = 10000) {
    const t = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms));
    return Promise.race([promise, t]);
  },

  // Detecta se Firebase está configurado
  get configured() {
    try { return typeof firebaseConfig !== 'undefined' && firebaseConfig.apiKey !== 'COLE_AQUI'; }
    catch(e) { return false; }
  },

  init() {
    if (!Firebase.configured) {
      console.warn('⚠️ Firebase não configurado — modo demo ativo.');
      Firebase._demoMode();
      return;
    }
    try {
      firebase.initializeApp(firebaseConfig);
    } catch(e) { /* already initialized */ }

    document.getElementById('login-screen').style.display = 'flex';

    firebase.auth().onAuthStateChanged(async user => {
      if (user) {
        await Firebase._onLogin(user);
      } else {
        Firebase._onLogout();
      }
    });
  },

  _demoMode() {
    // Sem Firebase — carrega dados de seed e pula login
    DB.orcamentos      = SEED_ORCAMENTOS.map(o => ({...o}));
    DB.modelos_produto = SEED_MODELOS.map(m => ({...m}));
    DB.usuarios        = SEED_USUARIOS.map(u => ({...u}));
    Firebase.currentPerms    = { bi:true, faturamento:true, pcp:true, maquinas:true, orcamentos:true, admin:true };
    Firebase.currentUserData = { nome:'Demo Admin', funcao:'Administrador' };
    document.getElementById('login-screen').style.display  = 'none';
    document.getElementById('app-shell').style.display     = 'flex';
    document.getElementById('app-shell').classList.add('visible');
    Firebase._updateSidebar();
    App._start();
  },

  async _onLogin(user) {
    Firebase.currentUser = user;

    // Entra imediatamente com dados demo — Firestore carrega em background
    Firebase.currentPerms    = { bi:true, faturamento:true, pcp:true, maquinas:true, orcamentos:true, admin:true };
    Firebase.currentUserData = { nome: user.email.split('@')[0], funcao: 'Admin' };
    DB.orcamentos      = SEED_ORCAMENTOS.map(o => ({...o}));
    DB.modelos_produto = SEED_MODELOS.map(m => ({...m}));
    DB.usuarios        = SEED_USUARIOS.map(u => ({...u}));

    // Mostra o app imediatamente (sem esperar Firestore)
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app-shell').style.display    = 'flex';
    document.getElementById('app-shell').classList.add('visible');
    Firebase._updateSidebar();
    Auth._updateUI();
    App._start();

    // Carrega dados reais do Firestore em background (não bloqueia a entrada)
    Firebase._syncFirestore(user);
  },

  async _syncFirestore(user) {
    const db = firebase.firestore();
    try {
      // Carrega perfil do usuário
      const snap = await Firebase._withTimeout(
        db.collection('usuarios').where('email','==', user.email).limit(1).get(), 8000
      );
      if (!snap.empty) {
        Firebase.currentUserData = { _fid: snap.docs[0].id, ...snap.docs[0].data() };
        Firebase.currentPerms    = Firebase.currentUserData.permissoes || Firebase.currentPerms;
        Firebase._updateSidebar();
        Auth._updateUI();
      } else {
        // Primeiro login — cria documento admin
        const novoUser = {
          id: 'USR-001', nome: user.email.split('@')[0], email: user.email,
          funcao: 'Diretoria', ativo: true,
          criado: new Date().toISOString().split('T')[0],
          permissoes: { bi:true, faturamento:true, pcp:true, maquinas:true, orcamentos:true, admin:true },
        };
        try {
          const ref = await Firebase._withTimeout(db.collection('usuarios').add(novoUser), 8000);
          novoUser._fid = ref.id;
          Firebase.currentUserData = novoUser;
        } catch(_) { /* sem Firestore, mantém dados locais */ }
      }

      // Carrega dados das coleções
      await Firebase.loadAll();
    } catch(e) {
      console.warn('Firestore indisponível — usando dados locais:', e.message);
    }
  },

  _onLogout() {
    Firebase.currentUser     = null;
    Firebase.currentPerms    = {};
    Firebase.currentUserData = null;
    document.getElementById('app-shell').classList.remove('visible');
    document.getElementById('app-shell').style.display    = 'none';
    document.getElementById('login-screen').style.display = 'flex';
    // Limpa campos
    const e = document.getElementById('login-email');
    const s = document.getElementById('login-senha');
    if (e) e.value = ''; if (s) s.value = '';
  },

  async login() {
    const email = (document.getElementById('login-email').value || '').trim();
    const senha = document.getElementById('login-senha').value || '';
    const err   = document.getElementById('login-error');
    const btn   = document.getElementById('login-btn');
    err.style.display = 'none';
    if (!email || !senha) { err.textContent = 'Preencha e-mail e senha.'; err.style.display = 'block'; return; }
    btn.textContent = 'Entrando…'; btn.disabled = true;
    try {
      await firebase.auth().signInWithEmailAndPassword(email, senha);
    } catch(e) {
      err.textContent = 'E-mail ou senha incorretos.'; err.style.display = 'block';
      btn.textContent = 'Entrar'; btn.disabled = false;
    }
  },

  logout() {
    if (Firebase.configured) firebase.auth().signOut();
    else Firebase._onLogout();
  },

  async loadAll() {
    const db = firebase.firestore();
    try {
      const [orcsSnap, modelosSnap, usuariosSnap] = await Firebase._withTimeout(Promise.all([
        db.collection('orcamentos').orderBy('criado','desc').limit(300).get(),
        db.collection('modelos_produto').get(),
        db.collection('usuarios').get(),
      ]));
      DB.orcamentos      = orcsSnap.docs.map(d => ({ _fid: d.id, ...d.data() }));
      DB.modelos_produto = modelosSnap.docs.map(d => ({ _fid: d.id, ...d.data() }));
      DB.usuarios        = usuariosSnap.docs.map(d => ({ _fid: d.id, ...d.data() }));

      // Semeia dados iniciais se coleções estão vazias
      if (DB.orcamentos.length === 0)      await Firebase._seed('orcamentos',      SEED_ORCAMENTOS);
      if (DB.modelos_produto.length === 0) await Firebase._seed('modelos_produto', SEED_MODELOS);
      if (DB.usuarios.length === 0)        await Firebase._seed('usuarios',        SEED_USUARIOS);
    } catch(e) {
      console.error('Erro ao carregar Firestore:', e);
      // Fallback para seed em caso de erro de permissão
      if (!DB.orcamentos.length)      DB.orcamentos      = SEED_ORCAMENTOS.map(o => ({...o}));
      if (!DB.modelos_produto.length) DB.modelos_produto = SEED_MODELOS.map(m => ({...m}));
      if (!DB.usuarios.length)        DB.usuarios        = SEED_USUARIOS.map(u => ({...u}));
    }
  },

  async _seed(col, data) {
    const db = firebase.firestore();
    const batch = db.batch();
    data.forEach(item => { const r = db.collection(col).doc(); batch.set(r, item); });
    await batch.commit();
    const snap = await db.collection(col).get();
    DB[col] = snap.docs.map(d => ({ _fid: d.id, ...d.data() }));
  },

  // ── CRUD ──────────────────────────────────────────────────────────

  async saveOrcamento(orc) {
    if (!Firebase.configured) return;
    const db = firebase.firestore();
    if (orc._fid) {
      await db.collection('orcamentos').doc(orc._fid).set(orc);
    } else {
      const ref = await db.collection('orcamentos').add(orc);
      orc._fid = ref.id;
    }
  },

  async updateOrcamentoStatus(orcId, status) {
    if (!Firebase.configured) return;
    const db = firebase.firestore();
    const snap = await db.collection('orcamentos').where('id','==', orcId).limit(1).get();
    if (!snap.empty) await snap.docs[0].ref.update({ status });
  },

  async saveModelo(modelo) {
    if (!Firebase.configured) return;
    const db = firebase.firestore();
    if (modelo._fid) {
      await db.collection('modelos_produto').doc(modelo._fid).set(modelo);
    } else {
      const ref = await db.collection('modelos_produto').add(modelo);
      modelo._fid = ref.id;
    }
  },

  async saveUsuario(usuario) {
    if (!Firebase.configured) return;
    const db = firebase.firestore();
    if (usuario._fid) {
      await db.collection('usuarios').doc(usuario._fid).set(usuario);
    } else {
      const ref = await db.collection('usuarios').add(usuario);
      usuario._fid = ref.id;
    }
  },

  _updateSidebar() {
    const p  = Firebase.currentPerms;
    const ud = Firebase.currentUserData;
    // Visibilidade dos módulos
    const mods = { bi:'bi', faturamento:'faturamento', pcp:'pcp', maquinas:'maquinas', orcamentos:'orcamentos' };
    Object.entries(mods).forEach(([key, page]) => {
      const el = document.querySelector(`.nav-item[data-page="${page}"]`);
      if (el) el.style.display = (p[key] !== false) ? '' : 'none';
    });
    // Admin nav
    const adminNav = document.getElementById('navAdmin');
    if (adminNav) adminNav.style.display = p.admin ? '' : 'none';
    // Sidebar footer
    if (ud) {
      const initials = n => (n||'?').split(' ').slice(0,2).map(w => w[0].toUpperCase()).join('');
      const av = document.getElementById('sb-avatar');
      const nm = document.getElementById('sb-nome');
      const fn = document.getElementById('sb-funcao');
      if (av) av.textContent  = initials(ud.nome || '');
      if (nm) nm.textContent  = ud.nome  || ud.email || '—';
      if (fn) fn.textContent  = ud.funcao || '—';
    }
  },
};

// ===== AUTH (wrapper Firebase) =====
const Auth = {
  get logado()  { return !!Firebase.currentUser || !Firebase.configured; },
  get isAdmin() { return !!Firebase.currentPerms?.admin; },

  init() {
    // Delegado ao Firebase.init() — mantido por compatibilidade
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
      overlay.addEventListener('click', e => {
        if (e.target === overlay) overlay.classList.remove('open');
      });
    });
  },

  require(callback) {
    if (Auth.isAdmin) { callback(); return; }
    alert('Você não tem permissão para acessar esta área.\nFale com o administrador do sistema.');
  },

  logout() { Firebase.logout(); },

  _updateUI() {
    const lock      = document.getElementById('navAdminLock');
    const logoutBtn = document.getElementById('adminLogoutBtn');
    if (lock)      lock.textContent            = Auth.isAdmin ? '🔓' : '🔒';
    if (logoutBtn) logoutBtn.style.display     = Auth.isAdmin ? 'inline-flex' : 'none';
  },
};

// ===== FUNÇÕES DE USUÁRIO =====
const FUNCOES_USUARIO = [
  { grupo:'Diretoria & Gestão',      funcoes:['Diretoria','Gerente Comercial','Gerente de Produção','Supervisor de Produção','Supervisor de Estoque'] },
  { grupo:'Comercial',               funcoes:['Faturamento/Fiscal','Financeiro','Comercial Interno - Backoffice','Comercial Interno - SDR','Comercial Interno - Executivo de Vendas','Comercial Interno - Executivo de Contas'] },
  { grupo:'Produção',                funcoes:['Arte Final','PCP','Manutenção','Operador','Auxiliar de Impressão','Impressor'] },
  { grupo:'Logística & Estoque',     funcoes:['Expedição','Estoque','Estoque Papel','Compras'] },
];

// ===== ADMIN PAGE (controle de abas) =====
const AdminPage = {
  tabAtiva: 'usuarios',

  render() {
    const logoutBtn = document.getElementById('adminLogoutBtn');
    if (logoutBtn) logoutBtn.style.display = Auth.logado ? 'inline-flex' : 'none';
    AdminPage.setTab(AdminPage.tabAtiva);
  },

  setTab(tab) {
    AdminPage.tabAtiva = tab;
    // Atualiza botões
    ['usuarios','modelos'].forEach(t => {
      const btn = document.getElementById(`adminTab${t.charAt(0).toUpperCase()+t.slice(1)}`);
      if (btn) btn.classList.toggle('active', t === tab);
    });
    // Mostra/oculta painéis
    const u = document.getElementById('admin-tab-usuarios');
    const m = document.getElementById('admin-tab-modelos');
    if (u) u.style.display = tab === 'usuarios' ? '' : 'none';
    if (m) m.style.display = tab === 'modelos'  ? '' : 'none';
    // Renderiza conteúdo
    if (tab === 'usuarios') UserAdmin.render();
    else ModelAdmin.render();
  },
};

// ===== USER ADMIN =====
const MODULOS_PERM = [
  { id:'bi',          label:'BI',          icon:'📊' },
  { id:'faturamento', label:'Faturamento',  icon:'💰' },
  { id:'pcp',         label:'PCP',          icon:'✅' },
  { id:'maquinas',    label:'Máquinas',     icon:'⚙️' },
  { id:'orcamentos',  label:'Orçamentos',   icon:'📄' },
  { id:'admin',       label:'Config.',      icon:'🔒' },
];

const UserAdmin = {
  editingId: null,

  _getPerms() {
    const p = {};
    MODULOS_PERM.forEach(m => { p[m.id] = document.getElementById(`perm-${m.id}`)?.checked ?? true; });
    return p;
  },

  _setPerms(permissoes) {
    const p = permissoes || {};
    MODULOS_PERM.forEach(m => {
      const el = document.getElementById(`perm-${m.id}`);
      if (el) el.checked = p[m.id] !== undefined ? p[m.id] : true;
    });
  },

  setAllPerms(val) {
    MODULOS_PERM.forEach(m => {
      const el = document.getElementById(`perm-${m.id}`);
      if (el) el.checked = val;
    });
  },

  render() {
    const list  = document.getElementById('admin-users-list');
    const count = document.getElementById('admin-users-count');
    if (!list) return;

    const ativos   = DB.usuarios.filter(u => u.ativo).length;
    const inativos = DB.usuarios.length - ativos;
    if (count) count.textContent = `${DB.usuarios.length} usuário${DB.usuarios.length !== 1 ? 's' : ''} · ${ativos} ativo${ativos !== 1 ? 's' : ''}${inativos ? ` · ${inativos} inativo${inativos !== 1 ? 's' : ''}` : ''}`;

    const initials = nome => nome.split(' ').slice(0,2).map(p => p[0].toUpperCase()).join('');

    const permBadges = u => MODULOS_PERM.map(m => {
      const on = u.permissoes?.[m.id];
      return `<span class="perm-badge${on ? '' : ' off'}" title="${m.label}">${m.icon} ${m.label}</span>`;
    }).join('');

    list.innerHTML = `
      <div class="user-table-card">
        <table class="user-table">
          <thead>
            <tr>
              <th>Usuário</th>
              <th>Função</th>
              <th>Permissões</th>
              <th>Status</th>
              <th>Cadastro</th>
              <th style="text-align:right">Ações</th>
            </tr>
          </thead>
          <tbody>
            ${DB.usuarios.map(u => `
              <tr class="${u.ativo ? '' : 'inativo'}">
                <td>
                  <div class="user-name-cell">
                    <div class="user-avatar">${initials(u.nome)}</div>
                    <div>
                      <div class="user-name">${u.nome}</div>
                      <div class="user-email">${u.email}</div>
                    </div>
                  </div>
                </td>
                <td><span class="badge-funcao">${u.funcao}</span></td>
                <td><div class="perm-badges">${permBadges(u)}</div></td>
                <td><span class="badge ${u.ativo ? 'badge-green' : 'badge-gray'}">${u.ativo ? 'Ativo' : 'Inativo'}</span></td>
                <td style="color:#94a3b8;font-size:12px">${u.criado ? new Date(u.criado+'T12:00:00').toLocaleDateString('pt-BR') : '—'}</td>
                <td style="text-align:right;white-space:nowrap">
                  <button class="btn btn-sm btn-secondary" onclick="UserAdmin.openEdit('${u.id}')">&#9998; Editar</button>
                  <button class="btn btn-sm ${u.ativo ? 'btn-danger' : 'btn-primary'}" style="margin-left:4px" onclick="UserAdmin.toggleAtivo('${u.id}')">${u.ativo ? 'Desativar' : 'Ativar'}</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  },

  openNew() {
    UserAdmin.editingId = null;
    document.getElementById('userFormTitle').textContent = 'Novo Usuário';
    document.getElementById('uf-nome').value    = '';
    document.getElementById('uf-email').value   = '';
    document.getElementById('uf-funcao').value  = '';
    document.getElementById('uf-senha').value   = '';
    document.getElementById('uf-ativo').checked = true;
    document.getElementById('uf-senha-obrig').style.display = 'inline';
    // Permissões: todos ON por padrão (exceto admin)
    UserAdmin._setPerms({ bi:true, faturamento:true, pcp:true, maquinas:true, orcamentos:true, admin:false });
    document.getElementById('modalUserForm').classList.add('open');
  },

  openEdit(id) {
    const u = DB.usuarios.find(x => x.id === id);
    if (!u) return;
    UserAdmin.editingId = id;
    document.getElementById('userFormTitle').textContent = 'Editar Usuário';
    document.getElementById('uf-nome').value    = u.nome;
    document.getElementById('uf-email').value   = u.email;
    document.getElementById('uf-funcao').value  = u.funcao;
    document.getElementById('uf-senha').value   = '';
    document.getElementById('uf-ativo').checked = u.ativo;
    document.getElementById('uf-senha-obrig').style.display = 'none';
    UserAdmin._setPerms(u.permissoes);
    document.getElementById('modalUserForm').classList.add('open');
  },

  save() {
    const nome   = document.getElementById('uf-nome').value.trim();
    const email  = document.getElementById('uf-email').value.trim();
    const funcao = document.getElementById('uf-funcao').value;
    const senha  = document.getElementById('uf-senha').value.trim();
    const ativo  = document.getElementById('uf-ativo').checked;
    const permissoes = UserAdmin._getPerms();

    if (!nome)  { alert('Nome é obrigatório.'); return; }
    if (!email) { alert('E-mail é obrigatório.'); return; }
    if (!funcao){ alert('Selecione uma função.'); return; }
    if (!UserAdmin.editingId && !senha) { alert('Senha é obrigatória para novo usuário.'); return; }
    if (senha && senha.length < 6)     { alert('Senha deve ter mínimo 6 caracteres.'); return; }

    if (UserAdmin.editingId) {
      const u = DB.usuarios.find(x => x.id === UserAdmin.editingId);
      if (u) { u.nome = nome; u.email = email; u.funcao = funcao; u.ativo = ativo; u.permissoes = permissoes; }
    } else {
      DB.usuarios.push({
        id: 'USR-' + String(DB.usuarios.length + 1).padStart(3,'0'),
        nome, email, funcao, ativo, permissoes,
        criado: new Date().toISOString().split('T')[0],
      });
    }
    closeModal('modalUserForm');
    UserAdmin.render();
    // Persiste no Firestore
    if (UserAdmin.editingId) {
      const u = DB.usuarios.find(x => x.id === UserAdmin.editingId);
      if (u) Firebase.saveUsuario(u).catch(console.error);
    } else {
      const u = DB.usuarios[DB.usuarios.length - 1];
      if (u) Firebase.saveUsuario(u).catch(console.error);
    }
  },

  toggleAtivo(id) {
    const u = DB.usuarios.find(x => x.id === id);
    if (u) { u.ativo = !u.ativo; UserAdmin.render(); }
  },
};

// ===== MODEL ADMIN =====
const ModelAdmin = {
  editingId: null,
  editingFieldModelId: null,

  render() {
    const list = document.getElementById('admin-models-list');
    if (!list) return;

    list.innerHTML = DB.modelos_produto.map(m => `
      <div class="admin-model-card${m.ativo ? '' : ' inativo'}">
        <div class="admin-model-header">
          <div>
            <span class="admin-model-nome">${m.nome}</span>
            <span class="badge ${m.ativo ? 'badge-green' : 'badge-gray'}" style="margin-left:8px">${m.ativo ? 'Ativo' : 'Inativo'}</span>
            <span class="badge badge-blue" style="margin-left:4px">${m.categoria}</span>
          </div>
          <div style="display:flex;gap:6px">
            <button class="btn btn-sm btn-secondary" onclick="ModelAdmin.openEdit('${m.id}')">&#9998; Editar</button>
            <button class="btn btn-sm ${m.ativo ? 'btn-danger' : 'btn-primary'}" onclick="ModelAdmin.toggleAtivo('${m.id}')">${m.ativo ? 'Desativar' : 'Ativar'}</button>
          </div>
        </div>
        <p style="font-size:12px;color:#64748b;margin:4px 0 10px">${m.descricao}</p>
        <div class="admin-model-fields">
          <div style="font-size:11px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:.4px;margin-bottom:6px">
            Campos Extras (${m.campos_extras.length})
          </div>
          ${m.campos_extras.map(c => `
            <div class="admin-field-item">
              <span class="admin-field-label">${c.label}</span>
              <span class="badge badge-gray">${c.tipo}</span>
              ${c.obrigatorio ? '<span class="obrig">*</span>' : ''}
              <button class="btn btn-sm btn-danger" style="margin-left:auto;padding:2px 8px" onclick="ModelAdmin.removeField('${m.id}','${c.id}')">&#10005;</button>
            </div>
          `).join('')}
          <button class="btn btn-sm btn-secondary" style="margin-top:6px;width:100%" onclick="ModelAdmin.openAddField('${m.id}')">+ Adicionar Campo</button>
        </div>
      </div>
    `).join('');
  },

  openNewModel() {
    ModelAdmin.editingId = null;
    document.getElementById('modelFormTitle').textContent = 'Novo Modelo';
    document.getElementById('mf-nome').value = '';
    document.getElementById('mf-categoria').value = '';
    document.getElementById('mf-descricao').value = '';
    document.getElementById('mf-ativo').checked = true;
    document.getElementById('modalModelForm').classList.add('open');
  },

  openEdit(id) {
    const m = DB.modelos_produto.find(x => x.id === id);
    if (!m) return;
    ModelAdmin.editingId = id;
    document.getElementById('modelFormTitle').textContent = 'Editar Modelo';
    document.getElementById('mf-nome').value = m.nome;
    document.getElementById('mf-categoria').value = m.categoria;
    document.getElementById('mf-descricao').value = m.descricao;
    document.getElementById('mf-ativo').checked = m.ativo;
    document.getElementById('modalModelForm').classList.add('open');
  },

  saveModel() {
    const nome = document.getElementById('mf-nome').value.trim();
    if (!nome) { alert('Nome é obrigatório'); return; }
    if (ModelAdmin.editingId) {
      const m = DB.modelos_produto.find(x => x.id === ModelAdmin.editingId);
      if (m) {
        m.nome = nome;
        m.categoria = document.getElementById('mf-categoria').value.trim();
        m.descricao = document.getElementById('mf-descricao').value.trim();
        m.ativo = document.getElementById('mf-ativo').checked;
      }
    } else {
      DB.modelos_produto.push({
        id: 'MOD-' + String(DB.modelos_produto.length + 1).padStart(3,'0'),
        nome,
        categoria: document.getElementById('mf-categoria').value.trim(),
        descricao: document.getElementById('mf-descricao').value.trim(),
        ativo: document.getElementById('mf-ativo').checked,
        campos_extras: [],
      });
    }
    closeModal('modalModelForm');
    ModelAdmin.render();
    // Persiste no Firestore
    if (ModelAdmin.editingId) {
      const m = DB.modelos_produto.find(x => x.id === ModelAdmin.editingId);
      if (m) Firebase.saveModelo(m).catch(console.error);
    } else {
      const m = DB.modelos_produto[DB.modelos_produto.length - 1];
      if (m) Firebase.saveModelo(m).catch(console.error);
    }
  },

  toggleAtivo(id) {
    const m = DB.modelos_produto.find(x => x.id === id);
    if (m) { m.ativo = !m.ativo; ModelAdmin.render(); Firebase.saveModelo(m).catch(console.error); }
  },

  openAddField(modelId) {
    ModelAdmin.editingFieldModelId = modelId;
    document.getElementById('ff-label').value = '';
    document.getElementById('ff-tipo').value = 'text';
    document.getElementById('ff-opcoes').value = '';
    document.getElementById('ff-obrig').checked = false;
    document.getElementById('ff-opcoes-group').style.display = 'none';
    document.getElementById('modalFieldForm').classList.add('open');
  },

  saveField() {
    const label = document.getElementById('ff-label').value.trim();
    if (!label) { alert('Label é obrigatório'); return; }
    const tipo = document.getElementById('ff-tipo').value;
    const m = DB.modelos_produto.find(x => x.id === ModelAdmin.editingFieldModelId);
    if (!m) return;
    const field = {
      id: 'ce-' + Date.now(),
      label,
      tipo,
      obrigatorio: document.getElementById('ff-obrig').checked,
    };
    if (tipo === 'select') {
      field.opcoes = document.getElementById('ff-opcoes').value.split('\n').map(s => s.trim()).filter(Boolean);
    }
    m.campos_extras.push(field);
    closeModal('modalFieldForm');
    ModelAdmin.render();
  },

  removeField(modelId, fieldId) {
    const m = DB.modelos_produto.find(x => x.id === modelId);
    if (m) { m.campos_extras = m.campos_extras.filter(c => c.id !== fieldId); ModelAdmin.render(); }
  },
};

// ===== QUOTE BUILDER (wizard 4 steps) =====
const QuoteBuilder = {
  currentStep: 1,
  modeloSelecionado: null,
  data: {},

  open() {
    QuoteBuilder.currentStep = 1;
    QuoteBuilder.modeloSelecionado = null;
    QuoteBuilder.data = {};
    const hoje = new Date().toISOString().split('T')[0];
    const d15  = new Date(Date.now() + 15 * 86400000).toISOString().split('T')[0];
    const nextNum = `ORC-2026-0${String(DB.orcamentos.length + 90).padStart(3,'0')}`;
    QuoteBuilder.data.num = nextNum;
    QuoteBuilder.data.data = hoje;
    QuoteBuilder.data.validade = d15;
    document.getElementById('modalQuoteBuilder').classList.add('open');
    QuoteBuilder._renderStep1();
    QuoteBuilder._updateBar();
    QuoteBuilder._updateNav();
  },

  _campo(c, prefix) {
    const req = c.obrigatorio ? '<span class="obrig">*</span>' : '';
    const id = `${prefix}-${c.id}`;
    let input = '';
    if (c.tipo === 'select') {
      const opts = (c.opcoes || []).map(o => `<option value="${o}">${o}</option>`).join('');
      input = `<select id="${id}">${opts}</select>`;
    } else if (c.tipo === 'textarea') {
      input = `<textarea id="${id}" rows="3"></textarea>`;
    } else {
      const step = c.step ? ` step="${c.step}"` : (c.tipo === 'number' ? ' step="any"' : '');
      input = `<input type="${c.tipo}" id="${id}"${step}>`;
    }
    return `<div class="form-group"><label>${c.label} ${req}</label>${input}</div>`;
  },

  _renderStep1() {
    document.getElementById('qb-step-content').innerHTML = `
      <div class="qb-section-title">Identificação do Orçamento</div>
      <div class="form-grid">
        <div class="form-group">
          <label>Nº Orçamento</label>
          <input type="text" id="qb-num" value="${QuoteBuilder.data.num}" readonly style="background:#f8fafc">
        </div>
        <div class="form-group">
          <label>Data <span class="obrig">*</span></label>
          <input type="date" id="qb-data" value="${QuoteBuilder.data.data}">
        </div>
        <div class="form-group full">
          <label>Cliente <span class="obrig">*</span></label>
          <input type="text" id="qb-cliente" placeholder="Razão social do cliente" value="${QuoteBuilder.data.cliente || ''}">
        </div>
        <div class="form-group">
          <label>Canal <span class="obrig">*</span></label>
          <select id="qb-canal">
            <option value="Externo"${QuoteBuilder.data.canal==='Externo'?' selected':''}>Canal Externo</option>
            <option value="Interno"${QuoteBuilder.data.canal==='Interno'?' selected':''}>Canal Interno</option>
          </select>
        </div>
        <div class="form-group">
          <label>Responsável <span class="obrig">*</span></label>
          <select id="qb-responsavel">
            <option value="Canal Interno">Canal Interno</option>
            <option value="Carlos Silva">Carlos Silva</option>
            <option value="Ana Costa">Ana Costa</option>
            <option value="Roberto Lima">Roberto Lima</option>
            <option value="Mariana Santos">Mariana Santos</option>
          </select>
        </div>
        <div class="form-group">
          <label>Validade</label>
          <input type="date" id="qb-validade" value="${QuoteBuilder.data.validade}">
        </div>
        <div class="form-group">
          <label>Status inicial</label>
          <select id="qb-status">
            <option value="Gerado">Gerado</option>
            <option value="Revisão">Para Revisão</option>
            <option value="Em Negociação">Em Negociação</option>
          </select>
        </div>
      </div>
    `;
    if (QuoteBuilder.data.responsavel) {
      const sel = document.getElementById('qb-responsavel');
      if (sel) sel.value = QuoteBuilder.data.responsavel;
    }
    if (QuoteBuilder.data.status) {
      const sel = document.getElementById('qb-status');
      if (sel) sel.value = QuoteBuilder.data.status;
    }
  },

  _renderStep2() {
    const ativos = DB.modelos_produto.filter(m => m.ativo);
    const cards = ativos.map(m => `
      <div class="modelo-card${QuoteBuilder.modeloSelecionado === m.id ? ' selected' : ''}"
           onclick="QuoteBuilder.selectModelo('${m.id}')">
        <div style="font-weight:700;font-size:13px;color:#0f172a">${m.nome}</div>
        <div style="font-size:11px;color:#64748b;margin-top:2px">${m.categoria}</div>
        <div style="font-size:11px;color:#94a3b8;margin-top:4px">${m.descricao}</div>
      </div>
    `).join('');

    let camposExtrasHtml = '';
    if (QuoteBuilder.modeloSelecionado) {
      const mod = DB.modelos_produto.find(m => m.id === QuoteBuilder.modeloSelecionado);
      if (mod && mod.campos_extras.length) {
        camposExtrasHtml = `
          <div class="qb-section-title" style="margin-top:18px">Especificações — ${mod.nome}</div>
          <div class="form-grid">
            ${mod.campos_extras.map(c => QuoteBuilder._campo(c, 'qbce')).join('')}
          </div>
        `;
      }
    }

    document.getElementById('qb-step-content').innerHTML = `
      <div class="qb-section-title">Selecione o Modelo de Produto</div>
      <div class="modelo-grid">${cards}</div>
      <div class="qb-section-title" style="margin-top:18px">Campos Comuns</div>
      <div class="form-grid">
        ${CAMPOS_COMUNS.map(c => QuoteBuilder._campo(c, 'qbcc')).join('')}
      </div>
      ${camposExtrasHtml}
    `;

    // Restore saved values
    if (QuoteBuilder.data.cc) {
      CAMPOS_COMUNS.forEach(c => {
        const el = document.getElementById(`qbcc-${c.id}`);
        if (el && QuoteBuilder.data.cc[c.id] !== undefined) el.value = QuoteBuilder.data.cc[c.id];
      });
    }
    if (QuoteBuilder.data.ce && QuoteBuilder.modeloSelecionado) {
      const mod = DB.modelos_produto.find(m => m.id === QuoteBuilder.modeloSelecionado);
      if (mod) mod.campos_extras.forEach(c => {
        const el = document.getElementById(`qbce-${c.id}`);
        if (el && QuoteBuilder.data.ce[c.id] !== undefined) el.value = QuoteBuilder.data.ce[c.id];
      });
    }
  },

  selectModelo(id) {
    QuoteBuilder._saveStep2Values();
    QuoteBuilder.modeloSelecionado = id;
    QuoteBuilder._renderStep2();
  },

  _saveStep2Values() {
    QuoteBuilder.data.cc = {};
    CAMPOS_COMUNS.forEach(c => {
      const el = document.getElementById(`qbcc-${c.id}`);
      if (el) QuoteBuilder.data.cc[c.id] = el.value;
    });
    if (QuoteBuilder.modeloSelecionado) {
      QuoteBuilder.data.ce = QuoteBuilder.data.ce || {};
      const mod = DB.modelos_produto.find(m => m.id === QuoteBuilder.modeloSelecionado);
      if (mod) mod.campos_extras.forEach(c => {
        const el = document.getElementById(`qbce-${c.id}`);
        if (el) QuoteBuilder.data.ce[c.id] = el.value;
      });
    }
  },

  _renderStep3() {
    document.getElementById('qb-step-content').innerHTML = `
      <div class="qb-section-title">Quantidades e Prazos de Entrega</div>
      <div class="form-grid">
        ${CAMPOS_QTDS.map(c => QuoteBuilder._campo(c, 'qbq')).join('')}
      </div>
    `;
    if (QuoteBuilder.data.qtds) {
      CAMPOS_QTDS.forEach(c => {
        const el = document.getElementById(`qbq-${c.id}`);
        if (el && QuoteBuilder.data.qtds[c.id] !== undefined) el.value = QuoteBuilder.data.qtds[c.id];
      });
    }
  },

  _saveStep3Values() {
    QuoteBuilder.data.qtds = {};
    CAMPOS_QTDS.forEach(c => {
      const el = document.getElementById(`qbq-${c.id}`);
      if (el) QuoteBuilder.data.qtds[c.id] = el.value;
    });
  },

  _renderStep4() {
    document.getElementById('qb-step-content').innerHTML = `
      <div class="qb-section-title">Informações Comerciais</div>
      <div class="form-grid">
        ${CAMPOS_COMERCIAIS.map(c => QuoteBuilder._campo(c, 'qbcom')).join('')}
      </div>
      <div class="qb-section-title" style="margin-top:18px">Calculadora de Margem</div>
      <div class="calc-result" id="qb-calc">
        <div class="calc-item"><span>Valor Total</span><strong id="qb-calc-total">R$ 0,00</strong></div>
        <div class="calc-item"><span>Custo Total</span><strong id="qb-calc-custo">R$ 0,00</strong></div>
        <div class="calc-item highlight"><span>Margem Bruta</span><strong id="qb-calc-margem">0%</strong></div>
        <div class="calc-item"><span>Avaliação</span><strong id="qb-calc-label" style="font-size:12px">—</strong></div>
      </div>
    `;
    if (QuoteBuilder.data.com) {
      CAMPOS_COMERCIAIS.forEach(c => {
        const el = document.getElementById(`qbcom-${c.id}`);
        if (el && QuoteBuilder.data.com[c.id] !== undefined) el.value = QuoteBuilder.data.com[c.id];
      });
    }
    // wire up live calc
    ['qbcom-com-custo','qbcom-com-preco'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('input', QuoteBuilder.calcPreco);
    });
    QuoteBuilder.calcPreco();
  },

  calcPreco() {
    const qtd1 = parseFloat((document.getElementById('qbq-cq-qtd1') || {}).value) || 0;
    const custo = parseFloat((document.getElementById('qbcom-com-custo') || {}).value) || 0;
    const preco = parseFloat((document.getElementById('qbcom-com-preco') || {}).value) || 0;
    const qtd = qtd1;
    const margem = preco > 0 ? ((preco - custo) / preco * 100) : 0;
    const mi = margemInfo(margem);
    const total = document.getElementById('qb-calc-total');
    const custoEl = document.getElementById('qb-calc-custo');
    const margemEl = document.getElementById('qb-calc-margem');
    const labelEl = document.getElementById('qb-calc-label');
    if (total) total.textContent = fmt.moeda(qtd * preco);
    if (custoEl) custoEl.textContent = fmt.moeda(qtd * custo);
    if (margemEl) { margemEl.textContent = fmt.pct(margem); margemEl.style.color = mi.cor; }
    if (labelEl) { labelEl.textContent = mi.label; labelEl.style.color = mi.cor; }
  },

  _saveStep4Values() {
    QuoteBuilder.data.com = {};
    CAMPOS_COMERCIAIS.forEach(c => {
      const el = document.getElementById(`qbcom-${c.id}`);
      if (el) QuoteBuilder.data.com[c.id] = el.value;
    });
  },

  gerarPDF() {
    QuoteBuilder._saveStep4Values();
    const d   = QuoteBuilder.data;
    const mod = DB.modelos_produto.find(m => m.id === QuoteBuilder.modeloSelecionado);

    // Cálculos financeiros
    const qtd1  = parseFloat((d.qtds || {})[CAMPOS_QTDS[0].id])    || 0;
    const custo = parseFloat((d.com  || {})[CAMPOS_COMERCIAIS[3].id]) || 0;
    const preco = parseFloat((d.com  || {})[CAMPOS_COMERCIAIS[4].id]) || 0;
    const margem = preco > 0 ? ((preco - custo) / preco * 100) : 0;
    const mi     = margemInfo(margem);
    const fmtDate = s => s ? new Date(s + 'T12:00:00').toLocaleDateString('pt-BR') : '—';
    const fmtNum  = n => Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
    const fmtMil  = n => Number(n).toLocaleString('pt-BR');

    // Linhas de especificações
    const specsRows = CAMPOS_COMUNS.map(c => {
      const v = (d.cc || {})[c.id];
      return v ? `<tr><td>${c.label}</td><td>${v}</td></tr>` : '';
    }).join('');

    const extrasRows = (mod && mod.campos_extras.length) ? mod.campos_extras.map(c => {
      const v = (d.ce || {})[c.id];
      return v ? `<tr><td>${c.label}</td><td>${v}</td></tr>` : '';
    }).join('') : '';

    // Linhas de quantidades
    const qtdRows = [1,2,3].map(i => {
      const q = (d.qtds || {})[`cq-qtd${i}`];
      const e = (d.qtds || {})[`cq-ent${i}`];
      return q ? `<tr><td class="lbl">Quantidade ${i}</td><td>${fmtMil(q)} ${(d.cc||{})['cc-unidade'] || ''}</td><td class="lbl">Entrega ${i}</td><td>${e || '—'}</td></tr>` : '';
    }).join('');

    // Linhas comerciais (sem custo e preço — ficam no sumário)
    const comRows = CAMPOS_COMERCIAIS.slice(0,3).map(c => {
      const v = (d.com || {})[c.id];
      return v ? `<tr><td>${c.label}</td><td>${v}</td></tr>` : '';
    }).join('');

    const obs = (d.com || {})[CAMPOS_COMERCIAIS[5].id] || '';

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Orçamento ${d.num || ''}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:Arial,sans-serif;font-size:10.5pt;color:#1e293b;background:#fff}
  .page{max-width:780px;margin:0 auto;padding:28px 36px}

  /* Cabeçalho */
  .hdr{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #0f4c81;padding-bottom:14px;margin-bottom:18px}
  .co-name{font-size:19pt;font-weight:700;color:#0f4c81;letter-spacing:-0.5px;line-height:1}
  .co-sub{font-size:8.5pt;color:#64748b;margin-top:3px}
  .orc-badge{background:#0f4c81;color:#fff;font-size:12pt;font-weight:700;padding:5px 18px;border-radius:6px;display:block;text-align:center}
  .orc-num{font-size:9pt;color:#64748b;margin-top:4px;text-align:right}

  /* Barra de info */
  .info-bar{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;background:#f1f5f9;border-radius:8px;padding:11px 14px;margin-bottom:18px}
  .ii label{font-size:7.5pt;color:#64748b;text-transform:uppercase;letter-spacing:.5px;display:block}
  .ii span{font-size:10pt;font-weight:600;color:#0f172a}

  /* Seções */
  .sec{margin-bottom:16px}
  .sec-title{font-size:8.5pt;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:#0f4c81;background:#e0eaf5;padding:5px 10px;border-left:4px solid #0f4c81}
  table{width:100%;border-collapse:collapse}
  td{padding:5px 9px;border:1px solid #e2e8f0;font-size:10pt;vertical-align:top}
  tr:nth-child(odd) td{background:#f8fafc}
  td.lbl{width:25%;font-weight:500;color:#475569}
  td:first-child:not(.lbl){width:40%;font-weight:500;color:#475569}

  /* Resumo financeiro */
  .price-box{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;background:#f1f5f9;border-radius:8px;padding:14px 18px;margin-top:18px}
  .pi{text-align:center}
  .pi label{font-size:7.5pt;color:#64748b;text-transform:uppercase;letter-spacing:.5px;display:block;margin-bottom:3px}
  .pi .val{font-size:13pt;font-weight:700;color:#0f172a}
  .pi.mg .val{color:${mi.cor}}
  .pi .sub{font-size:8pt;color:#94a3b8;margin-top:1px}

  /* Observações */
  .obs-box{border:1px solid #e2e8f0;border-radius:6px;padding:9px 12px;font-size:10pt;color:#475569;min-height:36px;margin-top:10px}

  /* Assinaturas */
  .sigs{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:36px}
  .sig{border-top:1px solid #94a3b8;padding-top:6px;text-align:center;font-size:9pt;color:#475569}

  /* Rodapé */
  .ftr{border-top:1px solid #e2e8f0;padding-top:10px;margin-top:20px;display:flex;justify-content:space-between;font-size:8pt;color:#94a3b8}

  /* Avaliação de margem */
  .mg-badge{display:inline-block;padding:2px 10px;border-radius:12px;font-size:8.5pt;font-weight:600;background:${mi.bg};color:${mi.cor};margin-top:4px}

  @media print{
    body{-webkit-print-color-adjust:exact;print-color-adjust:exact}
    .page{padding:0;max-width:100%}
    .no-print{display:none!important}
  }
</style>
</head>
<body>
<div class="page">

  <!-- Cabeçalho -->
  <div class="hdr">
    <div>
      <div class="co-name">RÓTULOS &amp; ETIQUETAS</div>
      <div class="co-sub">Indústria de Rótulos e Etiquetas</div>
    </div>
    <div>
      <span class="orc-badge">ORÇAMENTO</span>
      <div class="orc-num">${d.num || '—'}</div>
    </div>
  </div>

  <!-- Barra de informações -->
  <div class="info-bar">
    <div class="ii"><label>Data</label><span>${fmtDate(d.data)}</span></div>
    <div class="ii"><label>Validade</label><span>${fmtDate(d.validade)}</span></div>
    <div class="ii"><label>Responsável</label><span>${d.responsavel || '—'}</span></div>
    <div class="ii"><label>Canal</label><span>${d.canal || '—'}</span></div>
  </div>

  <!-- Cliente -->
  <div class="sec">
    <div class="sec-title">Cliente</div>
    <table><tr><td>Razão Social</td><td>${d.cliente || '—'}</td></tr></table>
  </div>

  ${mod ? `
  <!-- Modelo -->
  <div class="sec">
    <div class="sec-title">Modelo de Produto</div>
    <table>
      <tr><td>Modelo</td><td>${mod.nome}</td></tr>
      <tr><td>Categoria</td><td>${mod.categoria}</td></tr>
      ${mod.descricao ? `<tr><td>Descrição</td><td>${mod.descricao}</td></tr>` : ''}
    </table>
  </div>` : ''}

  ${specsRows || extrasRows ? `
  <!-- Especificações -->
  <div class="sec">
    <div class="sec-title">Especificações Técnicas</div>
    <table>${specsRows}${extrasRows}</table>
  </div>` : ''}

  ${qtdRows ? `
  <!-- Quantidades -->
  <div class="sec">
    <div class="sec-title">Quantidades e Prazos de Entrega</div>
    <table>${qtdRows}</table>
  </div>` : ''}

  ${comRows ? `
  <!-- Condições comerciais -->
  <div class="sec">
    <div class="sec-title">Condições Comerciais</div>
    <table>${comRows}</table>
  </div>` : ''}

  <!-- Resumo financeiro -->
  <div class="price-box">
    <div class="pi">
      <label>Quantidade</label>
      <div class="val">${fmtMil(qtd1)}</div>
      <div class="sub">${(d.cc||{})['cc-unidade'] || 'unid.'}</div>
    </div>
    <div class="pi">
      <label>Custo Unitário</label>
      <div class="val">R$&nbsp;${fmtNum(custo)}</div>
    </div>
    <div class="pi">
      <label>Preço Unitário</label>
      <div class="val">R$&nbsp;${fmtNum(preco)}</div>
    </div>
    <div class="pi mg">
      <label>Margem Bruta</label>
      <div class="val">${margem.toFixed(1).replace('.',',')}%</div>
      <div class="mg-badge">${mi.label}</div>
    </div>
  </div>

  ${obs ? `
  <div style="margin-top:16px">
    <div style="font-size:8.5pt;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#475569;margin-bottom:4px">Observações</div>
    <div class="obs-box">${obs}</div>
  </div>` : ''}

  <!-- Assinaturas -->
  <div class="sigs">
    <div class="sig">Responsável pela Empresa</div>
    <div class="sig">Assinatura e Carimbo do Cliente</div>
  </div>

  <!-- Rodapé -->
  <div class="ftr">
    <span>Gerado em ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}</span>
    <span>Este orçamento tem validade de 15 dias a partir da data de emissão.</span>
  </div>

</div>
<script>window.onload = function(){ window.print(); }<\/script>
</body>
</html>`;

    const w = window.open('', '_blank', 'width=900,height=700');
    if (w) { w.document.write(html); w.document.close(); }
    else alert('Permita pop-ups para gerar o PDF.');
  },

  _updateBar() {
    for (let i = 1; i <= 4; i++) {
      const el = document.getElementById(`wz-step-${i}`);
      if (!el) continue;
      el.classList.remove('active','done');
      if (i === QuoteBuilder.currentStep) el.classList.add('active');
      else if (i < QuoteBuilder.currentStep) el.classList.add('done');
    }
  },

  _updateNav() {
    const prev = document.getElementById('qb-btn-prev');
    const next = document.getElementById('qb-btn-next');
    const save = document.getElementById('qb-btn-save');
    const pdf  = document.getElementById('qb-btn-pdf');
    if (prev) prev.style.display = QuoteBuilder.currentStep > 1 ? 'inline-flex' : 'none';
    if (next) next.style.display = QuoteBuilder.currentStep < 4 ? 'inline-flex' : 'none';
    if (save) save.style.display = QuoteBuilder.currentStep === 4 ? 'inline-flex' : 'none';
    if (pdf)  pdf.style.display  = QuoteBuilder.currentStep === 4 ? 'inline-flex' : 'none';
  },

  _saveCurrentStep() {
    if (QuoteBuilder.currentStep === 1) {
      QuoteBuilder.data.cliente    = (document.getElementById('qb-cliente') || {}).value || '';
      QuoteBuilder.data.data       = (document.getElementById('qb-data') || {}).value || '';
      QuoteBuilder.data.canal      = (document.getElementById('qb-canal') || {}).value || 'Externo';
      QuoteBuilder.data.responsavel= (document.getElementById('qb-responsavel') || {}).value || '';
      QuoteBuilder.data.validade   = (document.getElementById('qb-validade') || {}).value || '';
      QuoteBuilder.data.status     = (document.getElementById('qb-status') || {}).value || 'Gerado';
    } else if (QuoteBuilder.currentStep === 2) {
      QuoteBuilder._saveStep2Values();
    } else if (QuoteBuilder.currentStep === 3) {
      QuoteBuilder._saveStep3Values();
    } else if (QuoteBuilder.currentStep === 4) {
      QuoteBuilder._saveStep4Values();
    }
  },

  next() {
    QuoteBuilder._saveCurrentStep();
    if (QuoteBuilder.currentStep < 4) {
      QuoteBuilder.currentStep++;
      QuoteBuilder._updateBar();
      QuoteBuilder._updateNav();
      QuoteBuilder._renderCurrentStep();
    }
  },

  prev() {
    QuoteBuilder._saveCurrentStep();
    if (QuoteBuilder.currentStep > 1) {
      QuoteBuilder.currentStep--;
      QuoteBuilder._updateBar();
      QuoteBuilder._updateNav();
      QuoteBuilder._renderCurrentStep();
    }
  },

  _renderCurrentStep() {
    if (QuoteBuilder.currentStep === 1) QuoteBuilder._renderStep1();
    else if (QuoteBuilder.currentStep === 2) QuoteBuilder._renderStep2();
    else if (QuoteBuilder.currentStep === 3) QuoteBuilder._renderStep3();
    else if (QuoteBuilder.currentStep === 4) QuoteBuilder._renderStep4();
  },

  save() {
    QuoteBuilder._saveStep4Values();
    const d = QuoteBuilder.data;
    const qtd1 = parseFloat((d.qtds || {})[CAMPOS_QTDS[0].id]) || 0;
    const custo = parseFloat((d.com || {})[CAMPOS_COMERCIAIS[3].id]) || 0;
    const preco = parseFloat((d.com || {})[CAMPOS_COMERCIAIS[4].id]) || 0;
    const titulo = (d.cc || {})[CAMPOS_COMUNS[0].id] || d.cliente || 'Produto';
    const newOrc = {
      id:          d.num || `ORC-2026-0${String(DB.orcamentos.length + 90).padStart(3,'0')}`,
      cliente:     d.cliente || 'Cliente',
      produto:     titulo,
      qtd:         qtd1,
      custo_unit:  custo,
      preco_unit:  preco,
      criado:      d.data || new Date().toISOString().split('T')[0],
      validade:    d.validade || '',
      status:      d.status || 'Gerado',
      canal:       d.canal || 'Externo',
      responsavel: d.responsavel || '',
      obs:         (d.com || {})[CAMPOS_COMERCIAIS[5].id] || '',
      modelo_id:   QuoteBuilder.modeloSelecionado,
    };
    DB.orcamentos.unshift(newOrc);
    Firebase.saveOrcamento(newOrc).catch(console.error);
    closeModal('modalQuoteBuilder');
    if (App.currentPage === 'orcamentos') Orcamentos.render();
    App.updateBadges();
  },
};

// ===== INICIALIZAÇÃO =====
document.addEventListener('DOMContentLoaded', () => App.init());
