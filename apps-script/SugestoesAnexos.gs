/**
 * Sugestões — anexos (arquivo NOVO, 09/11/2026). Não altera o Sugestoes.gs nem outro .gs.
 *
 * Usado pelo assets/sugestoes.js v1.3: cada anexo (arquivo ou foto) sobe numa chamada própria
 * para sugestaoAnexo(); o arquivo fica numa pasta do Drive e o link volta para a página,
 * que o coloca no fim do texto da sugestão. A sugestão segue pelo enviarSugestao() de sempre.
 *
 * Pasta: "Sugestões das ferramentas (anexos)/AAAA-MM-DD", no Drive da conta que executa o app.
 * Para usar uma pasta que já existe (ex.: dentro da pasta da equipe), grave o ID dela na
 * propriedade do script SUG_ANEXOS_PASTA_ID (Configurações do projeto → Propriedades do script).
 */
var SUG_ANEXOS_NOME_PASTA = 'Sugestões das ferramentas (anexos)';
var SUG_ANEXOS_MAX_BYTES = 8 * 1024 * 1024;   // igual ao limite da página (8 MB por arquivo)

function sugestaoAnexo(a) {
  if (!a || !a.base64 || !a.nome) throw new Error('anexo vazio.');
  var bytes = Utilities.base64Decode(String(a.base64));
  if (!bytes.length) throw new Error('anexo vazio.');
  if (bytes.length > SUG_ANEXOS_MAX_BYTES) throw new Error('o anexo ' + a.nome + ' passa de 8 MB.');
  var nome = String(a.nome).replace(/[\\\/:*?"<>|\r\n]+/g, '_').slice(0, 120) || 'anexo';
  var tipo = /^[\w.+-]+\/[\w.+-]+$/.test(String(a.tipo || '')) ? String(a.tipo) : 'application/octet-stream';
  var quem = '';
  try { quem = Session.getActiveUser().getEmail(); } catch (e) {}
  var pasta = sugAnexosPastaDoDia_();
  var arq = pasta.createFile(Utilities.newBlob(bytes, tipo, nome));
  arq.setDescription('Anexo de sugestão' + (a.ferramenta ? ' – ' + String(a.ferramenta).slice(0, 60) : '') + (quem ? ' · ' + quem : ''));
  return { nome: nome, url: arq.getUrl(), tamanho: bytes.length };
}

function sugAnexosPastaDoDia_() {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);   // duas pessoas anexando ao mesmo tempo não criam pastas repetidas
  try {
    var props = PropertiesService.getScriptProperties();
    var id = props.getProperty('SUG_ANEXOS_PASTA_ID'), raiz = null;
    if (id) { try { raiz = DriveApp.getFolderById(id); if (raiz.isTrashed()) raiz = null; } catch (e) { raiz = null; } }
    if (!raiz) {
      raiz = DriveApp.createFolder(SUG_ANEXOS_NOME_PASTA);
      props.setProperty('SUG_ANEXOS_PASTA_ID', raiz.getId());
    }
    var dia = Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'yyyy-MM-dd');
    var it = raiz.getFoldersByName(dia);
    return it.hasNext() ? it.next() : raiz.createFolder(dia);
  } finally {
    lock.releaseLock();
  }
}
