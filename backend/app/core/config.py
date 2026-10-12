"""Yalnızca backend/.env dosyasından okunan, başlangıçta doğrulanan ayarlar."""

from pathlib import Path
from typing import Literal
from urllib.parse import urlsplit

from pydantic import Field, SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Ayarlar(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=Path(__file__).resolve().parents[2] / '.env',
        env_file_encoding='utf-8', extra='ignore', hide_input_in_errors=True,
    )

    app_env: Literal['development', 'test', 'production'] = 'development'
    app_host: str = '127.0.0.1'
    app_port: int = Field(default=8000, ge=1, le=65535)
    supabase_url: str
    supabase_jwt_issuer: str = ''
    supabase_jwt_audience: str = 'authenticated'
    cors_origins: list[str] = []
    database_runtime_url: SecretStr | None = None
    database_migration_url: SecretStr | None = None
    database_connection_mode: Literal['direct', 'session'] = 'session'
    database_ssl_ca_file: str | None = None
    database_pool_size: int = Field(default=2, ge=1, le=10)
    db_check_enabled: bool = False
    alembic_baseline_confirmed: bool = False

    @model_validator(mode='before')
    @classmethod
    def bos_db_alanlari(cls, values):
        if isinstance(values, dict):
            values = dict(values)
            for key in ('database_runtime_url', 'database_migration_url', 'database_ssl_ca_file'):
                if values.get(key) == '':
                    values[key] = None
        return values

    @model_validator(mode='after')
    def ayarlari_dogrula(self):
        self.supabase_url = self.supabase_url.rstrip('/')
        adres = urlsplit(self.supabase_url)
        if (adres.scheme != 'https' or not adres.hostname or adres.username
                or adres.password or adres.query or adres.fragment or adres.path):
            raise ValueError('SUPABASE_URL geçerli bir HTTPS proje adresi olmalıdır.')
        beklenen = self.supabase_url + '/auth/v1'
        if self.supabase_jwt_issuer and self.supabase_jwt_issuer != beklenen:
            raise ValueError('JWT issuer proje adresiyle eşleşmelidir.')
        self.supabase_jwt_issuer = beklenen
        if self.supabase_jwt_audience != 'authenticated':
            raise ValueError('Bu uygulama yalnızca authenticated audience kabul eder.')
        for origin in self.cors_origins:
            parcalar = urlsplit(origin)
            if (origin == '*' or parcalar.scheme not in ('http', 'https')
                    or not parcalar.netloc or parcalar.path or parcalar.query
                    or parcalar.fragment or parcalar.username or parcalar.password):
                raise ValueError('CORS listesinde yalnızca açık origin adresleri kullanılabilir.')
        # Ayrıntılı URL doğrulaması bağlantı modülünde yapılır; değerler repr'da maskelenir.
        if self.database_runtime_url and self.database_migration_url:
            if self.database_runtime_url.get_secret_value() == self.database_migration_url.get_secret_value():
                raise ValueError('Runtime ve migration bağlantıları ayrı olmalıdır.')
        return self

    @property
    def jwks_url(self) -> str:
        return self.supabase_jwt_issuer + '/.well-known/jwks.json'
