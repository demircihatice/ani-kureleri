"""Yalnız geçici test girdileri: eğitim datası veya gerçek annotation üretilmez."""
import socket

import pytest
import torch


@pytest.fixture(autouse=True)
def cevrimdisi_test(monkeypatch):
    def indirme_yasak(*args, **kwargs):
        pytest.fail("Unit test internet/model ağırlığı indirmeye çalıştı.")
    monkeypatch.setattr(torch.hub, "download_url_to_file", indirme_yasak)
    monkeypatch.setattr(socket, "create_connection", indirme_yasak)


@pytest.fixture(scope="session", autouse=True)
def cpu_sinirla():
    onceki = torch.get_num_threads()
    torch.set_num_threads(2)
    yield
    torch.set_num_threads(onceki)
