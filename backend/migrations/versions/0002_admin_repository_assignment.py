"""Allow tickets to wait for admin repository assignment."""

from alembic import op
import sqlalchemy as sa

revision = "0002_admin_repo_assignment"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column("tickets", "repository_url", existing_type=sa.String(length=500), nullable=True)


def downgrade() -> None:
    op.execute("UPDATE tickets SET repository_url = '' WHERE repository_url IS NULL")
    op.alter_column("tickets", "repository_url", existing_type=sa.String(length=500), nullable=False)