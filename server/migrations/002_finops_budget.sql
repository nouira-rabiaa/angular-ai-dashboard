CREATE TABLE finops_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  monthly_budget_usd REAL CHECK (monthly_budget_usd IS NULL OR (monthly_budget_usd > 0 AND monthly_budget_usd <= 1000000000))
);
