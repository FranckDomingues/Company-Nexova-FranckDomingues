import pytest

from app.inventory_service import assert_outbound_available, current_stock


def test_current_stock_is_net_movements():
    assert current_stock([12, 5], [4, 2]) == 11


def test_new_product_has_zero_stock_without_movements():
    assert current_stock([], []) == 0


def test_outbound_availability_allows_exact_stock():
    assert assert_outbound_available(4, 4) is None


def test_outbound_availability_rejects_oversell():
    with pytest.raises(ValueError, match="requested 5, available 4"):
        assert_outbound_available(4, 5)
