#!/usr/bin/env python3
"""
Nível de emergência das barragens de mineração (ANM/SIGBM, dados abertos) — coletor do painel de testes (13/11/2026).

Roda no GitHub Actions (.github/workflows/dados-barragens.yml). Baixa o conjunto de dados aberto "Barragens da
Mineração (SIGBM)" publicado pela ANM, separa as barragens de MG e grava:

  reservatorios/barragens/anm.json         lista de MG (nível de emergência, coordenadas, município…) — usada na aba
  reservatorios/barragens/diagnostico.md   o que foi encontrado em cada execução (arquivos, colunas, contagens, problemas)

Cautela (nada é inventado nem "consertado" em silêncio):
  * Só aceita links do próprio site da ANM (https, mesmo domínio); limite de tamanho por arquivo.
  * Reconhece as colunas pelo nome; se faltar alguma essencial, NÃO grava o anm.json (fica o anterior) e explica no
    diagnóstico.
  * Conferências antes de gravar: quantidade mínima de barragens (Brasil e MG), coordenadas dentro de MG, níveis
    reconhecidos, nível 3 raro. Se alguma falhar, mantém o arquivo anterior.
  * Linha com coordenada ou nível que não dá para ler entra como "pendente" (com o texto original), nunca com valor
    adivinhado.
  * Guarda o SHA-256 do arquivo de origem: o anm.json só muda quando a ANM muda o arquivo.

Uso: python3 -I scripts/baixar_barragens_anm.py reservatorios/barragens
Sem dependências além da biblioteca padrão (XLSX lido com zipfile + xml, sem pacote externo).
"""
import csv
import datetime as dt
import hashlib
import html
import io
import json
import re
import sys
import time
import unicodedata
import urllib.parse
import urllib.request
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

INDICES = [  # endereço novo (desde 2026) e o antigo, que a ANM disse que ficaria ativo até 30/06/2026
    "https://dadosabertos.anm.gov.br/SIGBM/",
    "https://app.anm.gov.br/dadosabertos/BARRAGEM/",
]
HOSTS_OK = {"dadosabertos.anm.gov.br", "app.anm.gov.br"}
UA = "SIMGE-IGAM-ferramentas-meteorologia/1.0 (painel de testes; github.com/patrickaguilar-pixel/ferramentas-meteorologia-patrick)"
MAX_BYTES = 60 * 1024 * 1024
EXT_OK = (".csv", ".zip", ".xlsx", ".json", ".txt")
MG_BBOX = (-51.1, -23.0, -39.8, -14.2)   # lon0, lat0, lon1, lat1 (com folga)

LOG = []


def log(msg):
    LOG.append(msg)
    print(msg, flush=True)


def norm(s):
    s = unicodedata.normalize("NFD", str(s or ""))
    s = "".join(c for c in s if unicodedata.category(c) != "Mn").upper()
    return re.sub(r"[^A-Z0-9]+", " ", s).strip()


def baixar(url, limite=MAX_BYTES):
    u = urllib.parse.urlparse(url)
    if u.scheme != "https" or u.hostname not in HOSTS_OK:
        raise ValueError(f"endereço fora do site da ANM: {url}")
    ult = None
    for tent in range(3):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=90) as r:
                dados = r.read(limite + 1)
                if len(dados) > limite:
                    raise ValueError(f"arquivo maior que {limite // 1048576} MB: {url}")
                return dados, r.headers.get("Content-Type", "")
        except Exception as e:  # noqa: BLE001 — registra e tenta de novo
            ult = e
            time.sleep(5 * (tent + 1))
    raise RuntimeError(f"falha ao baixar {url}: {ult}")


def links_do_indice(url, texto):
    out = []
    for m in re.finditer(r'href\s*=\s*["\']([^"\']+)["\']', texto, re.I):
        h = html.unescape(m.group(1))
        a = urllib.parse.urljoin(url, h)
        p = urllib.parse.urlparse(a)
        base = urllib.parse.urlparse(url).path   # só arquivos da pasta deste conjunto de dados (não de outros conjuntos)
        if p.scheme == "https" and p.hostname in HOSTS_OK and p.path.startswith(base) and p.path.lower().endswith(EXT_OK) and a not in out:
            out.append(a)
    return out


# ------------------------------------------------------------------ leitura de tabelas
def decodificar(b):
    for enc in ("utf-8-sig", "cp1252", "latin-1"):
        try:
            return b.decode(enc), enc
        except UnicodeDecodeError:
            continue
    raise ValueError("codificação desconhecida")


def ler_csv(b):
    t, enc = decodificar(b)
    amostra = t[:20000]
    seps = {s: amostra.splitlines()[0].count(s) if amostra else 0 for s in (";", ",", "\t", "|")}
    sep = max(seps, key=seps.get)
    linhas = list(csv.reader(io.StringIO(t), delimiter=sep))
    # algumas planilhas têm linhas de título antes do cabeçalho: procura a 1ª linha com cara de cabeçalho
    for i, l in enumerate(linhas[:15]):
        n = " | ".join(norm(c) for c in l)
        if ("BARRAGEM" in n or "NOME" in n) and ("UF" in n.split(" | ") or "MUNICIPIO" in n or "LATITUDE" in n):
            return linhas[i], linhas[i + 1:], f"CSV ({enc}, separador {repr(sep)}, cabeçalho na linha {i + 1})"
    return linhas[0], linhas[1:], f"CSV ({enc}, separador {repr(sep)})"


def ler_xlsx(b):
    z = zipfile.ZipFile(io.BytesIO(b))
    ns = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    comp = []
    if "xl/sharedStrings.xml" in z.namelist():
        for si in ET.fromstring(z.read("xl/sharedStrings.xml")).findall("m:si", ns):
            comp.append("".join(t.text or "" for t in si.iter("{%s}t" % ns["m"])))
    planilhas = sorted(n for n in z.namelist() if re.match(r"xl/worksheets/sheet\d+\.xml$", n))
    if not planilhas:
        raise ValueError("XLSX sem planilhas")
    raiz = ET.fromstring(z.read(planilhas[0]))
    linhas = []
    for row in raiz.iter("{%s}row" % ns["m"]):
        vals = {}
        for c in row.findall("m:c", ns):
            ref = c.get("r", "")
            col = 0
            for ch in re.match(r"[A-Z]+", ref).group(0):
                col = col * 26 + ord(ch) - 64
            v = c.find("m:v", ns)
            if c.get("t") == "s" and v is not None:
                val = comp[int(v.text)]
            elif c.get("t") == "inlineStr":
                val = "".join(t.text or "" for t in c.iter("{%s}t" % ns["m"]))
            else:
                val = v.text if v is not None else ""
            vals[col - 1] = val
        if vals:
            linhas.append([vals.get(i, "") for i in range(max(vals) + 1)])
    for i, l in enumerate(linhas[:15]):
        n = " | ".join(norm(c) for c in l)
        if ("BARRAGEM" in n or "NOME" in n) and ("MUNICIPIO" in n or "LATITUDE" in n or "UF" in n.split(" | ")):
            return linhas[i], linhas[i + 1:], f"XLSX ({planilhas[0]}, cabeçalho na linha {i + 1})"
    return linhas[0], linhas[1:], f"XLSX ({planilhas[0]})"


def tabelas_do_arquivo(nome, b):
    """Devolve [(rotulo, cabecalho, linhas, descricao)]."""
    n = nome.lower()
    if n.endswith(".zip"):
        out = []
        z = zipfile.ZipFile(io.BytesIO(b))
        for inner in z.namelist():
            if inner.lower().endswith((".csv", ".txt", ".xlsx")) and z.getinfo(inner).file_size <= MAX_BYTES:
                out += tabelas_do_arquivo(f"{nome}::{inner}", z.read(inner))
        return out
    if n.endswith(".xlsx"):
        cab, lin, d = ler_xlsx(b)
        return [(nome, cab, lin, d)]
    if n.endswith(".json"):
        j = json.loads(decodificar(b)[0])
        reg = j if isinstance(j, list) else next((v for v in j.values() if isinstance(v, list)), []) if isinstance(j, dict) else []
        if reg and isinstance(reg[0], dict):
            cab = list(reg[0].keys())
            return [(nome, cab, [[r.get(k, "") for k in cab] for r in reg], "JSON")]
        return []
    cab, lin, d = ler_csv(b)
    return [(nome, cab, lin, d)]


# ------------------------------------------------------------------ colunas
# cada campo: lista de padrões (regex sobre o nome normalizado); o primeiro que casar vence
CAMPOS = {
    "id": [r"^ID( BARRAGEM)?$", r"^CODIGO( DA)? BARRAGEM$", r"^COD BARRAGEM$", r"^ID SIGBM$"],
    "nome": [r"^NOME( DA)? BARRAGEM$", r"^BARRAGEM$", r"^NOME$"],
    "empreendedor": [r"EMPREENDEDOR", r"RAZAO SOCIAL", r"^EMPRESA$", r"MINERADORA"],
    "uf": [r"^UF$", r"^ESTADO$", r"^SG UF$"],
    "municipio": [r"^MUNICIPIO$", r"^NOME( DO)? MUNICIPIO$", r"^MUNICIPIO S$", r"MUNICIPIO"],
    "lat": [r"^LATITUDE$", r"^LAT$", r"LATITUDE"],
    "lon": [r"^LONGITUDE$", r"^LON(G)?$", r"LONGITUDE"],
    "nivel": [r"NIVEL( DE)? EMERGENCIA", r"^NIVEL$", r"SITUACAO( DE)? EMERGENCIA", r"EMERGENCIA"],
    "alerta": [r"NIVEL( DE)? ALERTA", r"^ALERTA$", r"SITUACAO( DE)? ALERTA"],
    "cri": [r"CATEGORIA( DE)? RISCO", r"^CRI$", r"^RISCO$"],
    "dpa": [r"DANO POTENCIAL", r"^DPA$"],
    "situacao": [r"SITUACAO OPERACIONAL", r"^SITUACAO$", r"STATUS"],
    "metodo": [r"METODO CONSTRUTIVO", r"ALTEAMENTO"],
    "minerio": [r"MINERIO", r"SUBSTANCIA"],
    "atualizacao": [r"DATA( DA)? ULTIMA ATUALIZACAO", r"ATUALIZAD", r"DATA REFERENCIA"],
}
ESSENCIAIS = ["nome", "uf", "lat", "lon", "nivel"]


def mapear(cab):
    nc = [norm(c) for c in cab]
    m, usados = {}, set()
    for campo, pads in CAMPOS.items():
        for p in pads:
            for i, h in enumerate(nc):
                if i not in usados and h and re.search(p, h):
                    m[campo] = i
                    usados.add(i)
                    break
            if campo in m:
                break
    return m


# ------------------------------------------------------------------ valores
def coord(v):
    """Decimal ("-20,4148", "-20.4148") ou graus/minutos/segundos ("20°24'53,3\"S", "-20 24 53.3")."""
    s = str(v or "").strip()
    if not s:
        return None
    s2 = s.replace(",", ".")
    try:
        return float(s2)
    except ValueError:
        pass
    nums = re.findall(r"\d+(?:\.\d+)?", s2)
    if not 1 <= len(nums) <= 3:
        return None
    g = float(nums[0]) + (float(nums[1]) / 60 if len(nums) > 1 else 0) + (float(nums[2]) / 3600 if len(nums) > 2 else 0)
    if s2.strip().startswith("-") or re.search(r"[SWO]\s*$", s2.upper()):
        g = -g
    return g


def nivel(v):
    """0 = sem emergência; 1, 2, 3; None = não deu para ler (fica pendente)."""
    s = norm(v)
    if not s or s in ("NAO", "SEM EMERGENCIA", "SEM NIVEL", "NENHUM", "NAO SE APLICA", "NORMAL", "0", "NIVEL 0", "N A", "NA", "SEM", "NAO HA"):
        return 0
    m = re.search(r"(?:NIVEL|NE|N)\s*([0-3])\b", s) or re.fullmatch(r"([0-3])", s)
    if m:
        return int(m.group(1))
    m = re.search(r"\b([0-3])\b", s) if ("NIVEL" in s or "EMERG" in s) else None   # "Emergência 2", "Nível de Emergência 3"
    if m:
        return int(m.group(1))
    if "SEM" in s or "NAO" in s:
        return 0
    return None


def sim_nao(v):
    s = norm(v)
    if not s:
        return False
    return s.startswith("SIM") or s in ("S", "ALERTA", "EM ALERTA") or "ALERTA" in s and "SEM" not in s and "NAO" not in s


# ------------------------------------------------------------------ principal
def main():
    saida = Path(sys.argv[1] if len(sys.argv) > 1 else "reservatorios/barragens")
    saida.mkdir(parents=True, exist_ok=True)
    agora = dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%MZ")
    log(f"Execução: {agora}")
    anterior = None
    if (saida / "anm.json").exists():
        try:
            anterior = json.loads((saida / "anm.json").read_text(encoding="utf-8"))
        except Exception:  # noqa: BLE001
            anterior = None

    candidatos, indice_usado = [], None
    for idx in INDICES:
        try:
            b, ct = baixar(idx, 5 * 1024 * 1024)
            t = decodificar(b)[0]
            ls = links_do_indice(idx, t)
            log(f"Índice {idx}: {len(b)} bytes ({ct}); {len(ls)} link(s) de dados: " + ", ".join(ls[:30]))
            if ls:
                candidatos, indice_usado = ls, idx
                break
            log("  trecho do índice: " + re.sub(r"\s+", " ", t)[:600])
        except Exception as e:  # noqa: BLE001
            log(f"Índice {idx}: ERRO {e}")
    if not candidatos:
        return terminar(saida, agora, anterior, None, "nenhum arquivo de dados encontrado nos índices da ANM")

    melhor = None   # (pontuação, url, rotulo, cab, linhas, desc, mapa, sha)
    for url in candidatos[:12]:
        try:
            b, ct = baixar(url)
        except Exception as e:  # noqa: BLE001
            log(f"Arquivo {url}: ERRO {e}")
            continue
        sha = hashlib.sha256(b).hexdigest()
        try:
            tabs = tabelas_do_arquivo(urllib.parse.unquote(url.rsplit("/", 1)[-1]), b)
        except Exception as e:  # noqa: BLE001
            log(f"Arquivo {url} ({len(b)} bytes): não consegui ler ({e})")
            continue
        for rot, cab, lin, desc in tabs:
            mp = mapear(cab)
            pts = sum(3 if k in ESSENCIAIS else 1 for k in mp) + min(len(lin), 2000) / 2000
            log(f"Tabela {rot}: {desc}; {len(lin)} linhas; colunas: {cab}")
            log(f"  reconhecidas: { {k: cab[i] for k, i in mp.items()} }")
            if melhor is None or pts > melhor[0]:
                melhor = (pts, url, rot, cab, lin, desc, mp, sha)
    if not melhor:
        return terminar(saida, agora, anterior, None, "nenhuma tabela legível nos arquivos da ANM")

    _, url, rot, cab, lin, desc, mp, sha = melhor
    faltam = [k for k in ESSENCIAIS if k not in mp]
    if faltam:
        return terminar(saida, agora, anterior, None, f"tabela escolhida ({rot}) sem as colunas essenciais: {faltam}")

    def cel(r, k):
        i = mp.get(k)
        return r[i].strip() if i is not None and i < len(r) and r[i] is not None else ""

    total, mg, pend = 0, [], []
    cont_br = {0: 0, 1: 0, 2: 0, 3: 0, None: 0}
    for n, r in enumerate(lin, start=2):
        if not any(str(c).strip() for c in r):
            continue
        total += 1
        nv = nivel(cel(r, "nivel"))
        cont_br[nv] += 1
        if norm(cel(r, "uf")) not in ("MG", "MINAS GERAIS"):
            continue
        la, lo = coord(cel(r, "lat")), coord(cel(r, "lon"))
        item = {
            "id": cel(r, "id"), "nome": cel(r, "nome"), "empreendedor": cel(r, "empreendedor"), "municipio": cel(r, "municipio"),
            "uf": "MG", "lat": round(la, 6) if la is not None else None, "lon": round(lo, 6) if lo is not None else None,
            "nivel": nv, "nivel_texto": cel(r, "nivel"), "alerta": sim_nao(cel(r, "alerta")) if "alerta" in mp else None,
            "alerta_texto": cel(r, "alerta"), "cri": cel(r, "cri"), "dpa": cel(r, "dpa"), "situacao": cel(r, "situacao"),
            "metodo": cel(r, "metodo"), "minerio": cel(r, "minerio"), "atualizacao": cel(r, "atualizacao"), "linha": n,
        }
        prob = []
        if la is None or lo is None or not (MG_BBOX[0] <= lo <= MG_BBOX[2] and MG_BBOX[1] <= la <= MG_BBOX[3]):
            prob.append(f"coordenada fora de MG ou ilegível ({cel(r, 'lat')!r}, {cel(r, 'lon')!r})")
        if nv is None:
            prob.append(f"nível ilegível ({cel(r, 'nivel')!r})")
        if prob:
            item["pendencia"] = "; ".join(prob)
            pend.append(item)
        mg.append(item)

    cont_mg = {k: sum(1 for b in mg if b["nivel"] == k) for k in (0, 1, 2, 3)}
    cont_mg["ilegivel"] = sum(1 for b in mg if b["nivel"] is None)
    cont_mg["alerta"] = sum(1 for b in mg if b.get("alerta"))
    log(f"Escolhida: {rot} ({desc}); {total} barragens no arquivo; MG: {len(mg)}; níveis MG: {cont_mg}; Brasil: {cont_br}")

    # conferências (se falhar, não grava)
    erros = []
    if total < 300:
        erros.append(f"poucas barragens no arquivo ({total}); o cadastro da ANM tem perto de 900")
    if len(mg) < 100:
        erros.append(f"poucas barragens de MG ({len(mg)}); MG tem mais de 300")
    if cont_br[None] > max(5, 0.05 * total):
        erros.append(f"{cont_br[None]} níveis de emergência ilegíveis: o formato da coluna mudou")
    if cont_br[3] > 15:
        erros.append(f"{cont_br[3]} barragens em nível 3 no Brasil: improvável, conferir a coluna")
    if sum(1 for b in mg if b["lat"] is None) > 0.2 * max(1, len(mg)):
        erros.append("mais de 20 % das barragens de MG sem coordenada legível")
    if erros:
        return terminar(saida, agora, anterior, None, "conferência falhou: " + " | ".join(erros), extra=(rot, desc, cab, mp, mg))

    mg.sort(key=lambda b: (-(b["nivel"] or 0), b["municipio"], b["nome"]))
    novo = {
        "versao": 1, "fonte": "ANM — Sistema Integrado de Gestão de Barragens de Mineração (SIGBM), dados abertos",
        "indice": indice_usado, "arquivo": url, "tabela": rot, "formato": desc, "sha256": sha,
        "colunas": {k: cab[i] for k, i in mp.items()},
        "total_brasil": total, "niveis_brasil": {str(k): v for k, v in cont_br.items() if k is not None},
        "total_mg": len(mg), "niveis_mg": {str(k): v for k, v in cont_mg.items()}, "pendencias_mg": len(pend),
        "baixado_em": agora, "barragens": mg,
    }
    return terminar(saida, agora, anterior, novo, None, extra=(rot, desc, cab, mp, mg))


def terminar(saida, agora, anterior, novo, erro, extra=None):
    mudou = False
    if novo is not None:
        if anterior and anterior.get("sha256") == novo["sha256"]:
            log("Arquivo da ANM igual ao anterior: anm.json mantido.")
        else:
            (saida / "anm.json").write_text(json.dumps(novo, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
            mudou = True
            log("anm.json gravado.")
    else:
        log(f"NÃO GRAVADO: {erro}. " + ("O anm.json anterior foi mantido." if anterior else "Ainda não há anm.json."))
    st = {"verificado_em": agora, "ok": novo is not None, "erro": erro, "anm_json_mudou": mudou,
          "dados_de": (novo or anterior or {}).get("baixado_em")}
    (saida / "status.json").write_text(json.dumps(st, ensure_ascii=False, indent=1), encoding="utf-8")
    d = ["# Diagnóstico do coletor de barragens (ANM/SIGBM)", "", f"- Execução: {agora}",
         f"- Resultado: {'OK' if novo else 'NÃO GRAVADO — ' + str(erro)}", "", "## Registro", ""]
    d += [f"    {l}" for l in LOG]
    if extra:
        rot, desc, cab, mp, mg = extra
        d += ["", "## Barragens de MG com nível de emergência ≥ 1 ou em alerta (como lidas)", "",
              "| Nível | Alerta | Barragem | Município | Lat | Lon | Texto do nível | Pendência |", "|---|---|---|---|---|---|---|---|"]
        for b in sorted(mg, key=lambda x: -(x["nivel"] or 0)):
            if (b["nivel"] or 0) >= 1 or b.get("alerta") or b["nivel"] is None:
                d.append(f"| {b['nivel']} | {b.get('alerta')} | {b['nome']} | {b['municipio']} | {b['lat']} | {b['lon']} | {b['nivel_texto']} | {b.get('pendencia', '')} |")
        d += ["", "## Primeiras 3 linhas de MG (todas as colunas lidas)", ""]
        for b in mg[:3]:
            d.append("    " + json.dumps(b, ensure_ascii=False))
    (saida / "diagnostico.md").write_text("\n".join(d) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
