"""Temporary storage for aggregate incident results."""

from collections import OrderedDict
from threading import Lock
from uuid import uuid4

MAX_RESULTS = 100

_results = OrderedDict()
_lock = Lock()


def save_result(metrics):
    analysis_id = uuid4().hex

    with _lock:
        _results[analysis_id] = dict(metrics)

        while len(_results) > MAX_RESULTS:
            _results.popitem(last=False)

    return analysis_id


def get_result(analysis_id):
    with _lock:
        result = _results.get(analysis_id)
        return dict(result) if result is not None else None
