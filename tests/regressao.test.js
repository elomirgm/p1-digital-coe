// Suite de regressão do P1 DIGITAL COE — roda em CI a cada push, contra o
// index.html REAL do repo. Sem dependência além de jsdom. Cobre: boot limpo,
// login real (fluxo de DOM, não bypass), escrita granular confirmada por
// releitura (Escala.setSit), e a ponte SPAEI (leitura-only, nunca escreve).
const { bootApp } = require('./boot');

const resultados = [];
function checar(nome, ok, extra) {
  console.log(`${ok ? '✅' : '❌'} ${nome}${extra !== undefined ? ' — ' + String(extra).slice(0, 150) : ''}`);
  resultados.push(ok);
}

async function main() {
  // ───────────────────────────────────────────────────────────
  // GRUPO 1 — Boot limpo + login real via formulário (fluxo de DOM)
  // ───────────────────────────────────────────────────────────
  {
    const { window, store, errosJs } = await bootApp();
    window.eval(`
      DB.set('efetivo', [
        {rg:'82061', nome:'Fulano de Tal', posto:'CAP', chefe:false, admin:true},
      ], 'seed');
      _fbOk = true; _fbReady = true;
    `);
    await new Promise(r => setTimeout(r, 100));

    // Login real: preenche o formulário e chama Auth.login(), como um usuário faria
    window.eval(`
      document.getElementById('l-rg').value = '82061';
      document.getElementById('l-tok').value = 'COE2026';
    `);
    await window.eval(`Auth.login()`);
    await new Promise(r => setTimeout(r, 100));

    // Primeiro acesso (token inicial, sem PIN ainda) deve abrir a tela de definir senha
    const overlayVisivel = window.eval(`document.getElementById('overlay-pa').style.display`);
    checar('1.1 — 1º acesso com token abre tela de criar senha', overlayVisivel === 'flex');

    window.eval(`
      document.getElementById('pa-pin1').value = '123456';
      document.getElementById('pa-pin2').value = '123456';
    `);
    await window.eval(`Auth.definirPIN()`);
    await new Promise(r => setTimeout(r, 100));

    checar('1.2 — sessão criada após definir PIN', window.eval(`!!Auth.user && Auth.user.rg==='82061'`));
    const pinsSalvos = store.p1digital && store.p1digital.pins && store.p1digital.pins['82061'];
    checar('1.3 — PIN gravado no "servidor" (hash+salt)', !!pinsSalvos && !!pinsSalvos.hash && !!pinsSalvos.salt);
    checar('1.4 — zero erro JS não tratado no boot/login', errosJs.length === 0, errosJs.join('; '));
  }

  // ───────────────────────────────────────────────────────────
  // GRUPO 2 — Escrita granular confirmada (Escala.setSit) + log
  // ───────────────────────────────────────────────────────────
  {
    const { window, store, errosJs } = await bootApp();
    window.eval(`
      DB.set('efetivo', [{rg:'82061', nome:'Fulano de Tal', posto:'CAP', chefe:false, admin:true}], 'seed');
      _fbOk = true; _fbReady = true;
      Auth.user = {rg:'82061', nome:'Fulano de Tal', posto:'CAP', chefe:false, admin:true};
    `);
    await new Promise(r => setTimeout(r, 80));

    const ok = window.eval(`Escala.setSit('82061', 2, 'FOLGA')`);
    checar('2.1 — setSit retorna true (online, gravação aceita)', ok === true);
    await new Promise(r => setTimeout(r, 150));

    const semanaKey = window.eval(`getSemanaKey()`);
    const linhaLocal = window.eval(`DB.get('escalaSemanas')['${semanaKey}']['82061']`);
    checar('2.2 — escrita local imediata (dia 2 = FOLGA)', linhaLocal && linhaLocal[2] === 'FOLGA', linhaLocal);

    const remoto = store.p1digital && store.p1digital.escalaSemanas && store.p1digital.escalaSemanas[semanaKey] && store.p1digital.escalaSemanas[semanaKey]['82061'];
    checar('2.3 — servidor confirmou (releitura bate com o enviado)', !!remoto && remoto[2] === 'FOLGA', remoto);

    const pendPath = `escalaSemanas/${semanaKey}/82061`;
    const aindaPendente = window.eval(`!!_pendentes['${pendPath}']`);
    checar('2.4 — pendência limpa após confirmação (não fica pra sempre pendente)', aindaPendente === false);

    const ultimoLog = window.eval(`DB.get('logs')[0]`);
    checar('2.5 — log registrou a edição', ultimoLog && ultimoLog.tipo === 'EDICAO', ultimoLog);
    checar('2.6 — zero erro JS não tratado', errosJs.length === 0, errosJs.join('; '));
  }

  // ───────────────────────────────────────────────────────────
  // GRUPO 3 — Ponte SPAEI: leitura-only, nunca escreve em /spaei
  // ───────────────────────────────────────────────────────────
  {
    const { window, store, errosJs } = await bootApp();
    window.eval(`
      DB.set('efetivo', [{rg:'82061', nome:'Fulano de Tal', posto:'CAP', chefe:false, admin:true}], 'seed');
      _fbOk = true; _fbReady = true;
      Auth.user = {rg:'82061', nome:'Fulano de Tal', posto:'CAP', chefe:false, admin:true};
    `);
    await new Promise(r => setTimeout(r, 80));

    checar('3.1 — /spaei nunca recebeu escrita (ponte é read-only)', !(store.spaei && Object.keys(store.spaei.escalaSemanas || {}).length));
    checar('3.2 — zero erro JS não tratado', errosJs.length === 0, errosJs.join('; '));
  }

  const falhas = resultados.filter(r => !r).length;
  console.log('');
  console.log(falhas === 0 ? `=== TODOS OS ${resultados.length} TESTES PASSARAM ===` : `=== ${falhas} DE ${resultados.length} TESTE(S) FALHARAM ===`);
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch(e => { console.error('ERRO FATAL NA SUITE:', e); process.exit(1); });
