-- SQLite development schema. Apply with:
-- sqlite3 services/api/data/incidents.db < infra/migrations/0001_create_incidents.sql
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS incidents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_key VARCHAR(64) UNIQUE,
    title VARCHAR(120) NOT NULL CHECK (length(trim(title)) > 0),
    description TEXT NOT NULL CHECK (length(trim(description)) > 0),
    category VARCHAR(32) NOT NULL CHECK (category IN ('technical_failure','process_error','client_complaint','candidate_issue','staff_issue','sla_breach','data_quality','other')),
    status VARCHAR(16) NOT NULL CHECK (status IN ('open','in_progress','resolved','discarded')),
    origin VARCHAR(16) NOT NULL CHECK (origin IN ('customer','branch','internal')),
    branch VARCHAR(32) NOT NULL CHECK (branch IN ('central','valencia_operations','miami_office','remote')),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_incidents_category ON incidents(category);
CREATE INDEX IF NOT EXISTS ix_incidents_status ON incidents(status);
CREATE INDEX IF NOT EXISTS ix_incidents_origin ON incidents(origin);
CREATE INDEX IF NOT EXISTS ix_incidents_branch ON incidents(branch);
