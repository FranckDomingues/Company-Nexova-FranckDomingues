# Shared Nexova validation

`nexova_shared.csv_validation.validate_csv_row` is the privacy-safe validation implementation reused by the CSV seeder and API validation. It returns descriptive rule identifiers only and never includes user-supplied values (including email addresses).

Set `PYTHONPATH=packages/shared` or install the local package with `pip install -e packages/shared`.
