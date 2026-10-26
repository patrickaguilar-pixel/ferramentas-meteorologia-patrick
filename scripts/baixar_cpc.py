#!/usr/bin/env python3
"""Baixa as imagens do CPC/NOAA usadas na ferramenta Reservatórios e Tendência.

Para cada ciclo (00Z e 06Z) abre a página de cada produto no site do CPC,
localiza o GIF do mapa e grava em <destino>/<ciclo>/<produto>.gif, junto com
um manifest.json (origem, data no CPC, data do download, sha256).

- Só acessa o site do CPC (endereços fixos abaixo).
- Só grava arquivos que sejam GIF/PNG válidos e de tamanho razoável.
- Se um download falhar, mantém a imagem anterior e marca o erro no manifest.
- Só reescreve o manifest quando alguma imagem mudou (evita commits vazios).

Uso: python3 scripts/baixar_cpc.py reservatorios/cpc
"""
import email.utils
import hashlib
import html
import json
import os
import re
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timezone

BASE = os.environ.get(
    "CPC_BASE", "https://www.cpc.ncep.noaa.gov/products/international/cpci/data/"
)
HOST_PERMITIDO = urllib.parse.urlparse(BASE).netloc
CICLOS = ["00", "06"]

# chave: (página do CPC, nome direto do GIF como alternativa, descrição)
PRODUTOS = {
    "week1": ("gfs_precip_week1_samerica.html", "gfs.t{c}z.totp.week1.samerica.gif", "GFS Week 1"),
    "week2": ("gfs_precip_week2_samerica.html", "gfs.t{c}z.totp.week2.samerica.gif", "GFS Week 2"),
    "24h": ("gfs_precip_24h_samerica.html", "gfs.t{c}z.24h_totp.d1.samerica.gif", "GFS 24 h"),
    "day3": ("gfs_precip_day3_samerica.html", "gfs.t{c}z.totp.day3.samerica.gif", "GFS 3 dias"),
    "day5": ("gfs_precip_day5_samerica.html", "gfs.t{c}z.totp.day5.samerica.gif", "GFS 5 dias"),
    "prob100_week1": ("gefs_wk1_precip100mm_prob_samerica.html", None, "GEFS prob. >100 mm Week 1"),
    "prob100_week2": ("gefs_wk2_precip100mm_prob_samerica.html", None, "GEFS prob. >100 mm Week 2"),
}

TAM_MAX = 5 * 1024 * 1024
UA = "SIMGE-IGAM ferramentas-meteorologia (download automatico de imagens publicas do CPC)"


def baixar(url, limite=TAM_MAX):
    if urllib.parse.urlparse(url).netloc != HOST_PERMITIDO:
        raise ValueError(f"endereço fora do CPC recusado: {url}")
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        if urllib.parse.urlparse(r.geturl()).netloc != HOST_PERMITIDO:
            raise ValueError(f"redirecionamento para fora do CPC recusado: {r.geturl()}")
        dados = r.read(limite + 1)
        if len(dados) > limite:
            raise ValueError("arquivo maior que o limite")
        return dados, r.headers


def achar_imagem(pagina_url, texto, chave):
    """Procura na página o <img> do mapa (ignora logos e ícones)."""
    candidatos = []
    for m in re.finditer(r"<img\b[^>]*>", texto, re.I):
        tag = m.group(0)
        src = re.search(r'src\s*=\s*["\']?([^"\'\s>]+)', tag, re.I)
        if not src:
            continue
        src = html.unescape(src.group(1))
        alt = re.search(r'alt\s*=\s*["\']([^"\']*)', tag, re.I)
        alt = html.unescape(alt.group(1)).strip() if alt else ""
        if not re.search(r"\.(gif|png)$", src, re.I):
            continue
        pontos = 0
        if "samerica" in src.lower():
            pontos += 2
        if re.search(r"gfs|gefs|prec|totp", src, re.I):
            pontos += 1
        if re.search(r"logo|banner|icon|noaa|nws|header", src, re.I):
            pontos -= 3
        candidatos.append((pontos, urllib.parse.urljoin(pagina_url, src), alt))
    candidatos.sort(key=lambda x: -x[0])
    if candidatos and candidatos[0][0] > 0:
        return candidatos[0][1], candidatos[0][2]
    return None, ""


def tipo_imagem(dados):
    if dados[:6] in (b"GIF87a", b"GIF89a"):
        return "gif"
    if dados[:8] == b"\x89PNG\r\n\x1a\n":
        return "png"
    return None


def data_iso(cabecalho):
    try:
        return email.utils.parsedate_to_datetime(cabecalho).astimezone(timezone.utc).isoformat()
    except Exception:
        return None


def main(destino):
    agora = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    houve_mudanca = False
    for c in CICLOS:
        pasta = os.path.join(destino, c)
        os.makedirs(pasta, exist_ok=True)
        caminho_manifest = os.path.join(pasta, "manifest.json")
        try:
            with open(caminho_manifest, encoding="utf-8") as f:
                manifest = json.load(f)
        except Exception:
            manifest = {"ciclo": f"{c}Z", "produtos": {}}
        antigo = json.dumps(manifest, sort_keys=True)
        for chave, (pagina, direto, descricao) in PRODUTOS.items():
            item = manifest["produtos"].get(chave, {})
            pagina_url = f"{BASE}{c}/{pagina}"
            try:
                img_url, alt = None, ""
                try:
                    texto, _ = baixar(pagina_url, 1024 * 1024)
                    img_url, alt = achar_imagem(pagina_url, texto.decode("latin-1"), chave)
                except Exception as e:
                    print(f"[{c}Z {chave}] página indisponível ({e}); tentando nome direto")
                if not img_url and direto:
                    img_url = f"{BASE}{c}/{direto.format(c=c)}"
                if not img_url:
                    raise ValueError("imagem não encontrada na página")
                dados, cab = baixar(img_url)
                tipo = tipo_imagem(dados)
                if not tipo:
                    raise ValueError("o arquivo baixado não é GIF/PNG")
                sha = hashlib.sha256(dados).hexdigest()
                arquivo = f"{chave}.{tipo}"
                if item.get("sha256") != sha or item.get("arquivo") != arquivo:
                    with open(os.path.join(pasta, arquivo), "wb") as f:
                        f.write(dados)
                    item = {
                        "descricao": descricao,
                        "arquivo": arquivo,
                        "origem": img_url,
                        "pagina": pagina_url,
                        "texto_alternativo": alt,
                        "atualizado_no_cpc": data_iso(cab.get("Last-Modified")),
                        "baixado_em": agora,
                        "bytes": len(dados),
                        "sha256": sha,
                    }
                    print(f"[{c}Z {chave}] nova imagem ({len(dados)} bytes) de {img_url}")
                else:
                    item.pop("erro", None)
                    print(f"[{c}Z {chave}] sem mudança")
            except Exception as e:
                item["erro"] = str(e)[:200]
                print(f"[{c}Z {chave}] ERRO: {e}")
            manifest["produtos"][chave] = item
        if json.dumps(manifest, sort_keys=True) != antigo:
            manifest["atualizado_em"] = agora
            with open(caminho_manifest, "w", encoding="utf-8") as f:
                json.dump(manifest, f, ensure_ascii=False, indent=2)
            houve_mudanca = True
    print("mudanças gravadas" if houve_mudanca else "nada mudou")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "reservatorios/cpc")
