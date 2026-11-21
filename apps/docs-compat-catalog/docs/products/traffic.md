---
id: traffic
title: Traffic data product - hourly traffic per plaza
entity:
  type: data_product
  id: traffic
also:
  - type: table
    id: gold.traffic
links:
  - title: Dashboard
    url: https://example.com/traffic
---

# Traffic data product

Built from the [toll database](../systems/toll-db.md) every hour: {hour, plaza_id} -> vehicles.
