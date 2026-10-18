"""Yedi model sınıfı, Aleksitimi fallback ve kayıpsız eski katalog arşivi."""
from pathlib import Path
from alembic import op

revision = '20261017_05'
down_revision = '20261017_04'
branch_labels = None
depends_on = None

def upgrade():
    op.execute((Path(__file__).resolve().parents[2] / 'sql' / '20261017_05_final_emotions_up.sql').read_text(encoding='utf-8'))

def downgrade():
    # Eski tahmin/snapshot kimliklerine sessizce başka bir anlam yüklenmez.
    raise RuntimeError('Kategori geçişi otomatik geri alınmaz. Yedekten dönüş veya incelenmiş ileri migration kullanın.')
