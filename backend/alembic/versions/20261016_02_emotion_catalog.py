"""Merkezi duygu kataloğu ve legacy veriyi koruyan tek Ana Küre geçişi."""
from pathlib import Path

from alembic import op

revision = '20261016_02'
down_revision = '20261012_01'
branch_labels = None
depends_on = None


def _sql(yon: str) -> str:
    return (Path(__file__).resolve().parents[2] / 'sql' /
            f'20261016_02_emotions_{yon}.sql').read_text(encoding='utf-8')


def upgrade():
    op.execute(_sql('up'))


def downgrade():
    op.execute(_sql('down'))
