const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');
const api = yaml.safeLoad(fs.readFileSync(path.join(__dirname, '../openapi.yaml'), 'utf8'));
const examples = require('../examples/work-orders.json');
test('WorkOrderSummary is a strict bounded-link projection without execution notes', () => {
  const schema = api.components.schemas.WorkOrderSummary;
  expect(Object.keys(examples.summary.data[0]).sort()).toEqual(schema.required.slice().sort());
  expect(schema.additionalProperties).toBe(false);
  for (const key of ['report', 'requirements', 'blocker', 'verification', 'latest_completion', 'payload_json'])
    expect(schema.properties).not.toHaveProperty(key);
  expect(api.paths['/work-orders/summaries'].get.parameters.map(p => p.name)).toEqual(['factory_id', 'ids']);
});
test('commands are explicit discriminated requests with independent revision and no caller clock/actor', () => {
  const schemas = api.components.schemas;
  const variants = schemas.WorkOrderCommandRequest.oneOf.map(r => schemas[r.$ref.split('/').at(-1)]);
  expect(variants).toHaveLength(10);
  for (const s of variants) {
    expect(s.required).toEqual(expect.arrayContaining(['command', 'expected_revision']));
    expect(s.additionalProperties).toBe(false);
    for (const key of ['actor_id', 'occurred_at', 'status', 'actual_started_at']) expect(s.properties).not.toHaveProperty(key);
  }
  expect(schemas.WorkOrderCLOSECommand.required).toContain('verification');
  expect(schemas.WorkOrderCOMPLETECommand.required).toContain('report');
  expect(schemas.WorkOrderREASSIGNCommand.required).toEqual(expect.arrayContaining(['assignee_user_id','reason']));
});
