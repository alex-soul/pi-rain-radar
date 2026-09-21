export const APPLICATION_ID = 0x50525248; // PRRH
export const SCHEMA_VERSION = 1;
export const kinds = ['radar','weather','forecast','camera','transition','incident','settling'];
export const schema = `
CREATE TABLE meta(key TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT;
CREATE TABLE assets(
 id TEXT PRIMARY KEY, path TEXT NOT NULL UNIQUE, bytes INTEGER NOT NULL,
 time INTEGER NOT NULL, state TEXT NOT NULL CHECK(state IN ('staged','ready','delete'))
) STRICT;
CREATE INDEX assets_work ON assets(state,time,id);
CREATE TABLE records(
 id INTEGER PRIMARY KEY, kind TEXT NOT NULL, source TEXT NOT NULL,
 context TEXT NOT NULL, role TEXT NOT NULL, time INTEGER NOT NULL,
 received_at INTEGER NOT NULL, basis TEXT, data TEXT NOT NULL,
 asset TEXT REFERENCES assets(id),
 UNIQUE(kind,source,context,role,time)
) STRICT;
CREATE INDEX records_range ON records(kind,context,time,id);
CREATE INDEX records_source ON records(kind,source,context,time,id);
CREATE INDEX records_time ON records(time,id);
CREATE INDEX records_camera ON records(kind,time,id);
CREATE INDEX records_asset ON records(asset);
CREATE TABLE boundary_context(
 kind TEXT NOT NULL, source TEXT NOT NULL, context TEXT NOT NULL, role TEXT NOT NULL,
 time INTEGER NOT NULL, data TEXT NOT NULL,
 PRIMARY KEY(kind,source,context,role)
) STRICT;
CREATE TABLE totals(key TEXT PRIMARY KEY, value INTEGER NOT NULL) STRICT;
INSERT INTO totals VALUES('mediaBytes',0),('records',0);
CREATE TRIGGER record_added AFTER INSERT ON records BEGIN
 UPDATE totals SET value=value+1 WHERE key='records';
END;
CREATE TRIGGER record_removed AFTER DELETE ON records BEGIN
 UPDATE totals SET value=value-1 WHERE key='records';
END;
CREATE TRIGGER asset_added AFTER INSERT ON assets BEGIN
 UPDATE totals SET value=value+new.bytes WHERE key='mediaBytes';
END;
CREATE TRIGGER asset_removed AFTER DELETE ON assets BEGIN
 UPDATE totals SET value=value-old.bytes WHERE key='mediaBytes';
END;
`;
