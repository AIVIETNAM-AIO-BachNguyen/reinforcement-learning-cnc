const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');
const { listQuery } = require('../src/services/decision-case-list.service');
const api = yaml.safeLoad(fs.readFileSync(path.join(__dirname, '../openapi.yaml'), 'utf8'));
const example = require('../examples/decision-cases.list.json');

test('list OpenAPI limits and statuses agree with transport validation and canonical status fields', () => {
  const get = api.paths['/decision-cases'].get;
  expect(get.parameters.find(p => p.name === 'factory_id').required).toBe(true);
  expect(get.parameters.find(p => p.name === 'limit').schema).toMatchObject({ minimum: 1, maximum: 100, default: 25 });
  expect(listQuery.parse({ factory_id: 'factory-1' }).limit).toBe(25);
  for (const status of api.components.schemas.CaseContractDecisionCaseStatus.enum)
    expect(listQuery.safeParse({ factory_id: 'factory-1', status }).success).toBe(true);
  const fields = api.components.schemas.DecisionCaseListItem.properties;
  for (const [field, definition] of Object.entries(api.components.schemas.CaseContractDecisionCaseStatusResponse.properties))
    expect(fields[field]).toEqual(definition);
  expect(get.responses[400].description).toContain('INVALID_CURSOR');
  expect(get.responses[404].description).toContain('FACTORY_NOT_FOUND');
});
test('list example, strict summary keys and DTO fields are present in the documented contract', () => {
  expect(api.paths['/decision-cases'].get.responses[200].content['application/json'].examples.committed.value).toEqual(example);
  const schemas = api.components.schemas;
  expect(Object.keys(example).sort()).toEqual(schemas.DecisionCaseListResponse.required.slice().sort());
  expect(Object.keys(example.meta).sort()).toEqual(schemas.DecisionCaseListResponse.properties.meta.required.slice().sort());
  const dto = fs.readFileSync(path.join(__dirname, '../docs/operations-context/decision-case-list.d.ts'), 'utf8');
  for (const item of example.data) {
    expect(Object.keys(item).sort()).toEqual(schemas.DecisionCaseListItem.required.slice().sort());
    for (const key of Object.keys(item)) expect(dto).toContain(`${key}:`);
    expect(Object.keys(item.human_decision).sort()).toEqual(schemas.DecisionCaseListHumanSummary.required.slice().sort());
    expect(Object.keys(item.publication).sort()).toEqual(schemas.DecisionCaseListPublicationSummary.required.slice().sort());
  }
  for (const name of ['DecisionCaseListItem', 'DecisionCaseListHumanSummary', 'DecisionCaseListPublicationSummary']) {
    expect(schemas[name].additionalProperties).toBe(false);
    for (const forbidden of ['request', 'request_json', 'snapshot', 'artifact', 'payload_json', 'note', 'lease_token'])
      expect(schemas[name].properties).not.toHaveProperty(forbidden);
  }
});
test('event documentation explains exclusive pagination and human publication provenance', () => {
  const get = api.paths['/decision-cases/{id}/events'].get;
  expect(get.responses[200].content['application/json'].example).toEqual(require('../examples/decision-case-events.page.json'));
  for (const term of ['exclusive', 'sequence ASC', 'case_revision', 'APPROVE/REJECT/COMMIT', 'server-owned', 'SYSTEM'])
    expect(get.description).toContain(term);
  const fields = api.components.schemas.DecisionCaseHistoryEvent.properties.payload.properties;
  for (const key of ['command', 'recommendation_id', 'candidate_plan_id', 'candidate_version', 'candidate_hash', 'schedule_hash', 'plan_version'])
    expect(fields).toHaveProperty(key);
});
