BEGIN;
CREATE INDEX decision_cases_factory_created_id_desc_idx
  ON decision_cases(factory_id, created_at DESC, id DESC);
COMMIT;
