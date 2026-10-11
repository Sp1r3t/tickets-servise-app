"""Initial immutable schemas for each isolated service database."""

import os
from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None

SCHEMAS = {
    "identity": [
        "CREATE TABLE attempts (\n\tkey VARCHAR(64) NOT NULL, \n\tcount INTEGER NOT NULL, \n\tuntil INTEGER NOT NULL, \n\tPRIMARY KEY (key)\n)",
        "CREATE TABLE sessions (\n\ttoken_hash VARCHAR(64) NOT NULL, \n\tuser_id VARCHAR(36) NOT NULL, \n\texpires_at INTEGER NOT NULL, \n\tPRIMARY KEY (token_hash)\n)",
        "CREATE TABLE users (\n\tid VARCHAR(36) NOT NULL, \n\temail VARCHAR(180) NOT NULL, \n\tname VARCHAR(100) NOT NULL, \n\tpassword_hash VARCHAR(255) NOT NULL, \n\trole VARCHAR(20) NOT NULL, \n\tcreated_at INTEGER NOT NULL, \n\tPRIMARY KEY (id), \n\tUNIQUE (email)\n)",
    ],
    "catalog": [
        "CREATE TABLE events (\n\tid VARCHAR(36) NOT NULL, \n\towner_id VARCHAR(36) NOT NULL, \n\tstatus VARCHAR(20) NOT NULL, \n\tslug VARCHAR(80) NOT NULL, \n\tdetails JSON NOT NULL, \n\tlayout JSON, \n\tcreated_at INTEGER NOT NULL, \n\tPRIMARY KEY (id), \n\tUNIQUE (slug)\n)",
        "CREATE TABLE halls (\n\tid VARCHAR(36) NOT NULL, \n\towner_id VARCHAR(36) NOT NULL, \n\tname VARCHAR(150) NOT NULL, \n\tlayout JSON NOT NULL, \n\trevision INTEGER NOT NULL, \n\tupdated_at INTEGER NOT NULL, \n\tPRIMARY KEY (id)\n)",
        "CREATE INDEX ix_events_owner_id ON events (owner_id)",
        "CREATE INDEX ix_halls_owner_id ON halls (owner_id)",
    ],
    "inventory": [
        "CREATE TABLE event_stock (\n\tevent_id VARCHAR(36) NOT NULL, \n\tsnapshot_hash VARCHAR(64) NOT NULL, \n\tsales_end INTEGER NOT NULL, \n\tPRIMARY KEY (event_id)\n)",
        "CREATE TABLE holds (\n\tid VARCHAR(36) NOT NULL, \n\tevent_id VARCHAR(36) NOT NULL, \n\tbuyer_id VARCHAR(36) NOT NULL, \n\trequest_hash VARCHAR(64) NOT NULL, \n\tstate VARCHAR(20) NOT NULL, \n\texpires_at INTEGER NOT NULL, \n\titems JSON NOT NULL, \n\tPRIMARY KEY (id)\n)",
        "CREATE TABLE stock (\n\tevent_id VARCHAR(36) NOT NULL, \n\tseat_id VARCHAR(80) NOT NULL, \n\tprice INTEGER NOT NULL, \n\tlabel JSON NOT NULL, \n\tstate VARCHAR(20) NOT NULL, \n\thold_id VARCHAR(36), \n\texpires_at INTEGER, \n\tPRIMARY KEY (event_id, seat_id)\n)",
    ],
    "orders": [
        "CREATE TABLE orders (\n\tid VARCHAR(36) NOT NULL, \n\tbuyer_id VARCHAR(36) NOT NULL, \n\tevent_id VARCHAR(36) NOT NULL, \n\tidempotency_key VARCHAR(128) NOT NULL, \n\trequest_hash VARCHAR(64) NOT NULL, \n\tstate VARCHAR(20) NOT NULL, \n\tseat_ids JSON NOT NULL, \n\titems JSON NOT NULL, \n\tevent_snapshot JSON NOT NULL, \n\tamount INTEGER NOT NULL, \n\texpires_at INTEGER NOT NULL, \n\tcreated_at INTEGER NOT NULL, \n\tnext_check_at INTEGER NOT NULL, \n\tPRIMARY KEY (id), \n\tCONSTRAINT uq_order_idempotency UNIQUE (buyer_id, idempotency_key)\n)",
        "CREATE TABLE tickets (\n\tid VARCHAR(36) NOT NULL, \n\torder_id VARCHAR(36) NOT NULL, \n\tevent_id VARCHAR(36) NOT NULL, \n\tseat_id VARCHAR(80) NOT NULL, \n\tbuyer_id VARCHAR(36) NOT NULL, \n\titem JSON NOT NULL, \n\tchecked_in_at INTEGER, \n\tPRIMARY KEY (id), \n\tCONSTRAINT uq_ticket_seat UNIQUE (event_id, seat_id)\n)",
        "CREATE INDEX ix_orders_event_id ON orders (event_id)",
        "CREATE INDEX ix_orders_buyer_id ON orders (buyer_id)",
        "CREATE INDEX ix_tickets_order_id ON tickets (order_id)",
    ],
    "payments": [
        "CREATE TABLE payments (\n\tid VARCHAR(36) NOT NULL, \n\torder_id VARCHAR(36) NOT NULL, \n\tbuyer_id VARCHAR(36) NOT NULL, \n\tamount INTEGER NOT NULL, \n\tcurrency VARCHAR(3) NOT NULL, \n\tstate VARCHAR(20) NOT NULL, \n\texpires_at INTEGER NOT NULL, \n\tcreated_at INTEGER NOT NULL, \n\tPRIMARY KEY (id), \n\tUNIQUE (order_id)\n)"
    ],
}


def upgrade():
    for sql in SCHEMAS[os.environ["SERVICE_NAME"]]:
        op.execute(sql)


def downgrade():
    raise RuntimeError("Destructive downgrade requires an explicit reviewed migration")
