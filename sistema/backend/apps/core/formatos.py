"""
Padrões de preenchimento usados por mais de um cadastro (cliente, usuário).
O front aplica a mesma máscara; aqui é a garantia de que nada fora do padrão
entra no banco.
"""
import re

# Onde a empresa atende: região metropolitana de Belém (municípios e distritos).
# A mesma lista alimenta a busca do campo Cidade no React (frontend/src/mascaras.js).
CIDADES = ["Belém", "Ananindeua", "Marituba", "Benfica", "Americano", "Santa Bárbara", "Mosqueiro", "Outeiro",
           "Benevides", "Santa Isabel"]

# preposições que ficam minúsculas no nome ("Maria da Silva")
_MINUSCULAS = {"da", "de", "do", "das", "dos", "e"}


def digitos(texto):
    return re.sub(r"\D", "", texto or "")


def telefone(texto):
    """
    "66999881122" → "(66) 99988-1122"; fixo de 10 dígitos → "(66) 3522-1122".
    Aceita o +55 na frente. Levanta ValueError com a explicação se não servir.
    """
    d = digitos(texto)
    if len(d) in (12, 13) and d.startswith("55"):
        d = d[2:]
    if len(d) not in (10, 11):
        raise ValueError("Telefone precisa de DDD + número: 10 ou 11 dígitos, ex.: (94) 99999-0000.")
    if d[0] == "0" or d[1] == "0":
        raise ValueError("DDD inválido.")
    if len(d) == 11 and d[2] != "9":
        raise ValueError("Celular com 11 dígitos começa com 9 depois do DDD.")
    meio = 7 if len(d) == 11 else 6
    return f"({d[:2]}) {d[2:meio]}-{d[meio:]}"


def nome_proprio(texto):
    """'  maria  DA silva ' → 'Maria da Silva'."""
    partes = (texto or "").split()
    return " ".join(p.lower() if i and p.lower() in _MINUSCULAS else p[:1].upper() + p[1:].lower()
                    for i, p in enumerate(partes))


def _sem_acento(t):
    import unicodedata
    return "".join(c for c in unicodedata.normalize("NFD", t.lower()) if unicodedata.category(c) != "Mn")


def cidade(texto):
    """Devolve a grafia da lista (aceita 'belem', 'santa barbara'); ValueError se não é atendida."""
    t = _sem_acento((texto or "").strip())
    for c in CIDADES:
        nome = _sem_acento(c)
        if t in (nome, nome + " do para"):
            return c
    raise ValueError("Escolha uma cidade da lista (região metropolitana de Belém).")
