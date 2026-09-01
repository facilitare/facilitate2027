-- db/migrations/002_settings_seed.sql
insert into settings (key, value) values
  ('assessors_per_application', '3'),
  ('session_minutes',           '50'),      -- decided: 50 min, including introduction and close
  ('youth_threshold',           '35'),      -- decided: under 35 (matches form Q27)
  ('ethnicity_options',         '"uk_census"'),  -- decided 2026-08-19; exact wording pending review
  ('small_room_slots',          '4'),       -- rooms that can host a sub-30 session; confirm with venue
  ('iaf_bonus_mode',            '"additive"'), -- team decision: IAF standing is a scored column
  ('quality_min_mean_total',    '5.0'),
  ('quality_min_mean_criterion','1.0'),
  ('target_outside_england_wales_pct', '50'),
  ('target_youth_pct',          '10'),
  ('divergence_threshold',      '2'),
  ('normalisation_min_submissions', '5')
on conflict (key) do nothing;
