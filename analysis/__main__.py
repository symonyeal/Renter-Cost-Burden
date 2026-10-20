"""Full pipeline: fetch and aggregate sources, fit and evaluate, export the site."""
from threadpoolctl import threadpool_limits

from analysis import build_site, comparison, data, gap, models

data.run()
with threadpool_limits(limits=1):
    models.run()
comparison.run()
gap.run()
build_site.run()
