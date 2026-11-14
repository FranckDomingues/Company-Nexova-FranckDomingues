"""Pure inventory business rules; database and HTTP adapters call these helpers."""


def current_stock(inbound_quantities: list[int], outbound_quantities: list[int]) -> int:
    """Compute net quantity without persisting a stock snapshot."""
    return sum(inbound_quantities) - sum(outbound_quantities)


def assert_outbound_available(available: int, requested: int) -> None:
    """Reject impossible outbound quantities without changing persistence."""
    if requested > available:
        raise ValueError(
            f"Insufficient stock: requested {requested}, available {available}"
        )
