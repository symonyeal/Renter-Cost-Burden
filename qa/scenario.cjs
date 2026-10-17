const fs = require('fs');
const assert = require('assert');
const Model = require('../site/scenario.js');
const S = JSON.parse(fs.readFileSync('artifacts/scenarios.json','utf8'));
let n = 0, maxError = 0;
for (const model of ['linear','trees']) {
  const cases = S.rows.map((row,i) => ({row,pred:S['reference_'+model][i]}))
    .concat(S['cases_'+model]);
  for (const {row,pred} of cases) {
    const error = Math.abs(Model.evaluate(S[model],row)-pred);
    maxError = Math.max(maxError,error);
    assert(error<1e-7,`${model}: browser/Python difference ${error}`);n++;
  }
}
const row=S.rows[0], x=Model.adjust(row,{real_rent:row.real_rent*1.1});
assert(Math.abs((1+x.rent_growth/100)/(1+row.rent_growth/100)-
  1.1**(1/(row.acs_year-row.acs_previous)))<1e-10);
const pooled = Model.evaluate(S.linear,{...row,fips:'unseen'});
assert(Math.abs(Model.evaluate(S.linear,row)-pooled-S.linear.county[row.fips])<1e-9);
console.log(JSON.stringify({cases:n,max_error:maxError}));
