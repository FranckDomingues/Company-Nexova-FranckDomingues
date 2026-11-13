from nexova_shared.csv_validation import validate_csv_row

def test_rejects_missing_fields_without_echoing_private_values():
    errors = validate_csv_row({"ticket_id": "T-1", "customer_email": "private@example.test"})
    assert errors
    assert all("private@example.test" not in error for error in errors)
