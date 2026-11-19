"""The Resend setup helper only edits the RESEND_API_KEY line and never overwrites a key by accident."""

import importlib.util
from pathlib import Path

import pytest

_spec = importlib.util.spec_from_file_location("configure_resend", Path(__file__).resolve().parents[1] / "scripts" / "configure_resend.py")
configure = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(configure)

ENV = "DATABASE_URL=postgresql://example\nJWT_SECRET_KEY=keep-me\nRESEND_API_KEY=\nEMAIL_FROM=Nexova <onboarding@resend.dev>\n"


def test_fills_an_empty_key_and_preserves_every_other_line():
    result = configure.with_key(ENV, "re_dummy_key_for_tests", replace=False)
    assert configure.read_key(result) == "re_dummy_key_for_tests"
    assert result.replace("RESEND_API_KEY=re_dummy_key_for_tests", "RESEND_API_KEY=") == ENV


def test_appends_when_the_variable_is_missing():
    result = configure.with_key("JWT_SECRET_KEY=keep-me\n", "re_dummy_key_for_tests", replace=False)
    assert result.startswith("JWT_SECRET_KEY=keep-me\n") and configure.read_key(result) == "re_dummy_key_for_tests"


def test_refuses_to_overwrite_an_existing_key_unless_asked():
    existing = configure.with_key(ENV, "re_existing_key_value", replace=False)
    with pytest.raises(SystemExit):
        configure.with_key(existing, "re_other_key_value", replace=False)
    assert configure.read_key(configure.with_key(existing, "re_other_key_value", replace=True)) == "re_other_key_value"


def test_read_key_handles_quotes_and_absence():
    assert configure.read_key('RESEND_API_KEY="re_quoted_value"\n') == "re_quoted_value"
    assert configure.read_key("OTHER=1\n") == ""
