/**
 * SugestoesAnexos.gs — anexos da janela "Sugestões" (arquivo NOVO, 2026.11.09.1).
 * Não altera o Sugestoes.gs nem outro .gs.
 *
 * Usado pelo assets/sugestoes.js v1.3: cada anexo (arquivo ou foto) sobe numa chamada própria para
 * sugestaoAnexo(); o arquivo fica numa subpasta do dia (AAAA-MM-DD) da pasta configurada abaixo e o link
 * volta para a página, que o coloca no fim do texto da sugestão. A sugestão segue pelo enviarSugestao()
 * de sempre (aba oculta "Sugestoes" -> planner do Portal).
 *
 * IMPORTANTE: o app roda com a conta de quem acessa (USER_ACCESSING). Por isso a pasta TEM que ser
 * compartilhada, com permissão de EDITOR, com todos que usam as ferramentas (como as pastas de CONFIG.PASTAS).
 * Quem lê o planner precisa ao menos ver a pasta para abrir os links.
 */

// ======= CONFIGURAÇÃO: só mexa aqui =======
const SUG_ANEXOS = {
  PASTA_ID: '',                  // ID da pasta compartilhada "Sugestões das ferramentas (anexos)"
  MAX_BYTES: 8 * 1024 * 1024     // igual ao limite da página (8 MB por arquivo)
};
// ==========================================

function sugestaoAnexo(a) {
  usuarioAtual_(true);   // mesma checagem de conta das outras funções
  if (!SUG_ANEXOS.PASTA_ID) throw new Error('a pasta dos anexos ainda não foi configurada (SugestoesAnexos.gs, SUG_ANEXOS.PASTA_ID).');
  if (!a || !a.base64 || !a.nome) throw new Error('anexo vazio.');
  const bytes = Utilities.base64Decode(String(a.base64));
  if (!bytes.length) throw new Error('anexo vazio.');
  if (bytes.length > SUG_ANEXOS.MAX_BYTES) throw new Error('o anexo ' + a.nome + ' passa de 8 MB.');
  const nome = String(a.nome).replace(/[\\\/:*?"<>|\r\n]+/g, '_').slice(0, 120) || 'anexo';
  const tipo = /^[\w.+-]+\/[\w.+-]+$/.test(String(a.tipo || '')) ? String(a.tipo) : 'application/octet-stream';
  const email = usuarioAtual_(true);
  const arq = sugAnexosPastaDoDia_().createFile(Utilities.newBlob(bytes, tipo, nome));
  arq.setDescription('Anexo de sugestão' + (a.ferramenta ? ' – ' + String(a.ferramenta).slice(0, 60) : '') + (email ? ' · ' + email : ''));
  return { nome: nome, url: arq.getUrl(), tamanho: bytes.length };
}

/** Subpasta do dia (cria na primeira vez; a trava evita duas pastas iguais). */
function sugAnexosPastaDoDia_() {
  const raiz = DriveApp.getFolderById(SUG_ANEXOS.PASTA_ID);
  const dia = Utilities.formatDate(new Date(), CONFIG.FUSO, 'yyyy-MM-dd');
  let it = raiz.getFoldersByName(dia);
  if (it.hasNext()) return it.next();
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    it = raiz.getFoldersByName(dia);
    return it.hasNext() ? it.next() : raiz.createFolder(dia);
  } finally {
    lock.releaseLock();
  }
}

/** Rode pelo editor para testar: cria um anexo de teste e mostra o link no registro. */
function testarAnexoSugestoes() {
  Logger.log(JSON.stringify(sugestaoAnexo({ nome: 'teste_anexo.txt', tipo: 'text/plain', base64: Utilities.base64Encode('teste (pode apagar)'), ferramenta: 'Geral' })));
}
