-- 004_calibration — calibration set flag per 04-SPEC §3.13 / T17
alter table applications add column if not exists is_calibration boolean not null default false;
create index if not exists idx_applications_is_calibration on applications (is_calibration) where is_calibration = true;
