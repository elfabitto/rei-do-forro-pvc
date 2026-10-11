"""
Permissões do sistema.

A regra de negócio mora no modelo Usuario (propriedades `pode_*`); aqui só
traduzimos para o vocabulário do DRF, para que a mesma regra valha na API
e no admin sem duplicar lógica.
"""
from rest_framework.permissions import SAFE_METHODS, BasePermission


def pode_editar_registro(usuario, obj):
    """
    Quem pode mexer num orçamento ou numa O.S.: quem lançou, quem leva a
    comissão, e o superior (diretoria e administrativo). Ver, todo mundo vê.
    """
    if not (usuario and usuario.is_authenticated):
        return False
    if usuario.pode_ver_tudo:
        return True
    return usuario.id in (obj.vendedor_id, obj.criado_por_id)


class DonoOuSuperior(BasePermission):
    """Leitura liberada; escrita só para o dono do registro ou seu superior."""

    message = "Só quem lançou este registro (ou a diretoria) pode alterá-lo."

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated)

    def has_object_permission(self, request, view, obj):
        if request.method in SAFE_METHODS:
            return True
        return pode_editar_registro(request.user, obj)


class SomenteDiretor(BasePermission):
    message = "Ação restrita à diretoria."

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.e_diretor)


class LeituraOuDiretor(BasePermission):
    """Todo mundo lê; só a diretoria escreve. Usado no catálogo de preços."""

    message = "Alterar a tabela de preços é restrito à diretoria."

    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        return request.method in SAFE_METHODS or request.user.e_diretor


class PodeVender(BasePermission):
    message = "Seu perfil não cria orçamentos."

    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        return request.method in SAFE_METHODS or request.user.pode_vender
