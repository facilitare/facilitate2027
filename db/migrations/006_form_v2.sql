-- Form v2 (Oct 2026): new questions on the application form. See plan/11-FORM-2027-V2.md
alter table applications
  add column if not exists session_title          text,   -- 2.1 working title
  add column if not exists theme_reason           text,   -- 2.5 why aligned to theme
  add column if not exists q10_delivery_other     text,   -- 3.3 "Other:" free text
  add column if not exists cofacil_reason         text,   -- 3.4 reason for solo/co-facilitation
  add column if not exists large_group_experience text,   -- 4.2 50+ participants example — HIGH LEAK RISK
  add column if not exists inclusive_design       text;   -- 5.3 designing for diverse needs
