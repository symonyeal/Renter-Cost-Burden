/* Exact evaluation of exported standardized ridge and numerical histogram trees. */
(function(root) {
  function evaluate(m, row) {
    const z = m.features.map((f, j) =>
      ((row[f] == null ? m.impute[j] : row[f]) - m.mean[j]) / m.scale[j]);
    let y = m.intercept;
    if (m.model === 'linear') {
      y += m.beta.reduce((s, b, j) => s + b * z[j], 0) + (m.county[row.fips] || 0);
    } else {
      for (const tree of m.trees) {
        let k = 0;
        while (!tree[k].is_leaf) {
          const n = tree[k], v = z[n.feature_idx];
          k = (Number.isNaN(v) ? n.missing_go_to_left : v <= n.num_threshold)
            ? n.left : n.right;
        }
        y += tree[k].value;
      }
    }
    return Math.min(100, Math.max(0, y));
  }
  function adjust(row, values) {
    const x = {...row}, n = row.acs_year - row.acs_previous;
    for (const [key, value] of Object.entries(values)) {
      x[key] = value;
      if (key === 'real_rent' || key === 'real_income') {
        const g = key === 'real_rent' ? 'rent_growth' : 'income_growth';
        x[g] = 100 * ((1 + row[g] / 100) * (value / row[key]) ** (1 / n) - 1);
      }
    }
    return x;
  }
  root.Model = {evaluate, adjust};
  if (typeof module !== 'undefined') module.exports = root.Model;
})(typeof window === 'undefined' ? globalThis : window);
