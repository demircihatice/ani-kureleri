"""Memory API için kalıcı, kullanıcıya özel ilk istek özeti."""
from pathlib import Path

from alembic import op

revision = '20261016_03'
down_revision = '20261016_02'
branch_labels = None
depends_on = None


def _sql(yon):
    return (Path(__file__).resolve().parents[2] / 'sql' /
            f'20261016_03_memory_requests_{yon}.sql').read_text(encoding='utf-8')


def upgrade():
    op.execute(_sql('up'))


def downgrade():
    op.execute(_sql('down'))
