from ingestion.config import Settings


def test_worker_prefers_platform_direct_database_url(monkeypatch):
    monkeypatch.setenv("PLATFORM_DATABASE_DIRECT_URL", "postgresql://direct.example/database")
    monkeypatch.setenv("DATABASE_DIRECT_URL", "postgresql://legacy.example/database")
    monkeypatch.setenv("DATABASE_URL", "postgresql://pooled.example/database")

    assert Settings.from_env().database_url == "postgresql://direct.example/database"


def test_worker_falls_back_to_pooled_url_for_local_development(monkeypatch):
    monkeypatch.delenv("PLATFORM_DATABASE_DIRECT_URL", raising=False)
    monkeypatch.delenv("DATABASE_DIRECT_URL", raising=False)
    monkeypatch.setenv("DATABASE_URL", "postgresql://local.example/database")

    assert Settings.from_env().database_url == "postgresql://local.example/database"
