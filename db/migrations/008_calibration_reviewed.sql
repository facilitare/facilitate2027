-- 008_calibration_reviewed — a lead can mark a "needs calibration" application as manually reviewed (note required).
-- Scores and the computed needsCalibration flag are untouched; this is a separate, audited marker.
alter table applications add column if not exists calibration_reviewed_by uuid references evaluators(id);
alter table applications add column if not exists calibration_reviewed_at timestamptz;
alter table applications add column if not exists calibration_note text;
