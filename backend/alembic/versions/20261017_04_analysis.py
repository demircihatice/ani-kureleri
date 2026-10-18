"""Analiz işleri ve atomik, backend ile sınırlı analiz/feedback komutları."""
from pathlib import Path
from alembic import op
revision = '20261017_04'
down_revision = '20261016_03'
branch_labels = None
depends_on = None

def _sql(yon):
    return (Path(__file__).resolve().parents[2] / 'sql' / f'20261017_04_analysis_{yon}.sql').read_text(encoding='utf-8')

def upgrade():
    op.execute(_sql('up'))

def downgrade():
    op.execute(_sql('down'))
