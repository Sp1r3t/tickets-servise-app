"""Immutable community hall snapshots, owned by Catalog only."""

import os
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None

SCHEMA = [
    "CREATE TABLE catalog_tasks (id VARCHAR(80) PRIMARY KEY, completed_at INTEGER NOT NULL)",
    "\nCREATE TABLE hall_templates (\n\tid VARCHAR(64) NOT NULL, \n\tvenue_key VARCHAR(64) NOT NULL, \n\tsearch_text VARCHAR(600) NOT NULL, \n\tcity VARCHAR(120) NOT NULL, \n\tvenue VARCHAR(180) NOT NULL, \n\taddress VARCHAR(250) NOT NULL, \n\tsource_hall_id VARCHAR(36) NOT NULL, \n\tname VARCHAR(150) NOT NULL, \n\tauthor VARCHAR(180) NOT NULL, \n\tlayout JSON NOT NULL, \n\tcreated_at INTEGER NOT NULL, \n\tPRIMARY KEY (id)\n)\n\n",
    "CREATE INDEX ix_hall_templates_search_text ON hall_templates (search_text)",
    "CREATE INDEX ix_hall_templates_venue_key ON hall_templates (venue_key)",
    "\nCREATE TABLE hall_sources (\n\thall_id VARCHAR(36) NOT NULL, \n\ttemplate_id VARCHAR(64) NOT NULL, \n\tPRIMARY KEY (hall_id)\n)\n\n",
]


def upgrade():
    service = op.get_context().config.attributes.get("service_name") or os.environ.get("SERVICE_NAME")
    if service == "catalog":
        for sql in SCHEMA:
            op.execute(sql)


def downgrade():
    raise RuntimeError("Destructive downgrade requires an explicit reviewed migration")
