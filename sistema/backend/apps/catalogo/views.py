from rest_framework import viewsets

from apps.core.permissions import LeituraOuDiretor

from .models import Acabamento, Forro, Material
from .serializers import AcabamentoSerializer, ForroSerializer, MaterialSerializer


class ForroViewSet(viewsets.ModelViewSet):
    queryset = Forro.objects.all()
    serializer_class = ForroSerializer
    permission_classes = [LeituraOuDiretor]
    filterset_fields = ["ativo"]


class MaterialViewSet(viewsets.ModelViewSet):
    queryset = Material.objects.all()
    serializer_class = MaterialSerializer
    permission_classes = [LeituraOuDiretor]
    filterset_fields = ["ativo", "grupo"]


class AcabamentoViewSet(viewsets.ModelViewSet):
    queryset = Acabamento.objects.all()
    serializer_class = AcabamentoSerializer
    permission_classes = [LeituraOuDiretor]
    filterset_fields = ["ativo"]
