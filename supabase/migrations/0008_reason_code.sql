-- AT A GLANCE - Localizable band reason. Adds daily_state.reason_code so the UI renders the reason in any language; daily_state.reason keeps Korean text as a fallback.

-- ============================================================================
-- 0008 — The participant-facing band reason was written as fixed Korean text by
-- the nightly function. This adds a language-neutral code the UI maps to
-- localized copy (trends.reasons), so the trends screen reads in the viewer's
-- language. The existing `reason` text stays as a fallback for old rows.
-- ============================================================================

alter table daily_state add column reason_code text;

comment on column daily_state.reason_code is
  'Language-neutral reason key: steady | hr_high | recovery_low | steps_low. '
  'The app maps it to localized copy (apps/web trends.reasons). daily_state.reason '
  'keeps the original Korean text as a fallback for rows written before 0008.';
