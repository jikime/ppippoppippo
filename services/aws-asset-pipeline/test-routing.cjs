// Offline checks of the exact CloudFront function source in template.yaml.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync(path.join(__dirname, 'template.yaml'), 'utf8');
function handlerFor(resource, nextResource) {
  const block = source.split(`  ${resource}:`)[1].split(`  ${nextResource}:`)[0];
  const code = block.split('      FunctionCode: |')[1].trimEnd()
    .split('\n').slice(1).map(line => line.replace(/^        /, '')).join('\n');
  return vm.runInNewContext(code + '\nhandler;');
}
const spa = handlerFor('SpaRouteFunction', 'FrontendDistribution');
const api = handlerFor('ApiPrefixFunction', 'SpaRouteFunction');
const cases = [
  ['/', '/index.html'], ['/library', '/index.html'],
  ['/assets/main.css', '/assets/main.css'],
];
for (const [uri, expected] of cases) {
  const headers = { authorization: { value: 'Bearer offline-test' } };
  const querystring = { scenario: { value: 'school' } };
  const request = { uri, headers, querystring };
  const result = spa({ request });
  assert.equal(result.uri, expected);
  assert.equal(result.headers, headers);
  assert.equal(result.querystring, querystring);
}
for (const [uri, expected] of [['/api/jobs', '/jobs'], ['/api/health', '/health'], ['/api/jobs/id/model', '/jobs/id/model']]) {
  const headers = { authorization: { value: 'Bearer offline-test' } };
  const querystring = { test: { value: '1' } };
  const result = api({ request: { uri, headers, querystring } });
  assert.equal(result.uri, expected);
  assert.equal(result.headers, headers);
  assert.equal(result.querystring, querystring);
}
console.log('6 CloudFront routing cases passed; headers and query strings preserved.');
