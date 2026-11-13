# Data analysis skill utilities

## Safe CSV cleaning script

`skills/data-analysis/scripts/pandas_clean.py` validates and summarizes a CSV without writing input rows or column values to stdout. Input defaults to `data.csv` in the current directory. An optional output is safely replaced atomically only after the full transform is ready.

```bash
python -m pip install pandas
python skills/data-analysis/scripts/pandas_clean.py --input data.csv
python skills/data-analysis/scripts/pandas_clean.py --input data.csv --output cleaned.csv
```

Expected input, CSV, dependency, and output errors produce sanitized Spanish stderr messages and nonzero exit codes. Success returns 0. Do not use this demonstration utility with data whose retention/output requirements have not been approved.

Run its regression tests from the repository root with `python -m unittest discover -s skills/data-analysis/tests -v`.
