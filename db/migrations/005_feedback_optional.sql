-- 005: feedback optional — remove 20-char requirement on submit
alter table assessments drop constraint if exists submitted_is_complete;
alter table assessments add constraint submitted_is_complete check (
  state <> 'submitted' or (
    focus_score is not null and content_score is not null
    and interactivity_score is not null and credibility_score is not null
    and submitted_at is not null
  )
);
