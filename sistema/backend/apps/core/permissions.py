"""
Permissões do sistema.

A regra de negócio mora no modelo Usuario (propriedades `pode_*`); aqui só
traduzimos para o vocabulário do DRF, para que a mesma regra valha na API
e no admin sem duplicar lógica.
"""
from rest_framework.permissions import SAFE_METHODS, BasePermission


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
