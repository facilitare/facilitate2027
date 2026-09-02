-- 003_panel_discussion — free-text panel discussion thread per 04-SPEC §3.5
-- Single text column on applications, appended with author + timestamp.
alter table applications add column if not exists panel_discussion text;
