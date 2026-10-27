-- 007_takes_assessments — organising-team accounts keep their login (admin area) but are never given applications to assess.
alter table evaluators add column if not exists takes_assessments boolean not null default true;
