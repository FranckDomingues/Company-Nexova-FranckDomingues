from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from app.database import Base, get_session
from app.main import app
from app.orm import IncidentRecord

engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
TestingSession = sessionmaker(bind=engine, expire_on_commit=False)
Base.metadata.create_all(engine)
def override_session():
    with TestingSession() as session:
        yield session
app.dependency_overrides[get_session] = override_session
client = TestClient(app)
def setup_function():
    Base.metadata.drop_all(engine); Base.metadata.create_all(engine)
def payload(**changes):
    result = {"title": "Access failure", "description": "Unable to log in", "category": "technical_failure", "origin": "customer", "branch": "central"}; result.update(changes); return result

def test_empty_summary_crud_filters():
    assert client.get('/api/incidents/summary').json()['total'] == 0
    response = client.post('/api/incidents', json=payload()); assert response.status_code == 201
    incident_id = response.json()['id']; assert client.get(f'/api/incidents/{incident_id}').status_code == 200
    assert len(client.get('/api/incidents?branch=central&status=open').json()) == 1
    assert client.get('/api/incidents?branch=miami_office').json() == []
    assert client.get('/api/incidents/999').status_code == 404
    summary = client.get('/api/incidents/summary').json(); assert summary['total'] == 1 and summary['by_category']['technical_failure'] == 1

def test_status_lifecycle_and_validation():
    incident_id = client.post('/api/incidents', json=payload()).json()['id']
    assert client.patch(f'/api/incidents/{incident_id}/status', json={'status': 'resolved'}).status_code == 400
    assert client.patch(f'/api/incidents/{incident_id}/status', json={'status': 'in_progress'}).status_code == 200
    assert client.patch(f'/api/incidents/{incident_id}/status', json={'status': 'resolved'}).status_code == 200
    assert client.patch(f'/api/incidents/{incident_id}/status', json={'status': 'discarded'}).status_code == 400
    invalid = client.post('/api/incidents', json=payload(title=' ')); assert invalid.status_code == 400 and 'field_errors' in invalid.json()
    assert client.post('/api/incidents', json=payload(category='bogus')).status_code == 400

def test_database_constraints():
    import pytest
    from sqlalchemy.exc import IntegrityError
    with TestingSession() as session:
        session.add(IncidentRecord(title='x', description='x', category='wrong', status='open', origin='customer', branch='central'))
        with pytest.raises(IntegrityError): session.commit()


def test_seed_summary_totals_and_idempotency(tmp_path, monkeypatch):
    import importlib.util
    from pathlib import Path
    from sqlalchemy import func, select
    root = Path(__file__).resolve().parents[3]
    spec = importlib.util.spec_from_file_location('seed_incidents', root / 'scripts' / 'seed_incidents.py')
    seed_module = importlib.util.module_from_spec(spec); spec.loader.exec_module(seed_module)
    db_url = f"sqlite:///{tmp_path / 'seed.db'}"
    monkeypatch.setenv('DATABASE_URL', db_url)
    # Seed uses a dedicated SQLite URL so this remains isolated from local development data.
    first = seed_module.seed()
    second = seed_module.seed()
    assert (first['inserted'], first['invalid']) == (96, 4)
    assert first['invalid_reason:Missing client_company'] == 1
    assert first['invalid_reason:Invalid or missing category'] == 1
    assert first['invalid_reason:Invalid or missing email'] == 1
    assert first['invalid_reason:Closed ticket, no score'] == 1
    assert (second['inserted'], second['duplicates'], second['invalid']) == (0, 96, 4)
    from app.database import engine_for
    with engine_for(db_url).connect() as connection:
        status = dict(connection.execute(select(IncidentRecord.status, func.count()).group_by(IncidentRecord.status)).all())
        category = dict(connection.execute(select(IncidentRecord.category, func.count()).group_by(IncidentRecord.category)).all())
    assert status == {'open': 27, 'resolved': 56, 'discarded': 13}
    assert category == {'technical_failure': 49, 'process_error': 35, 'client_complaint': 12}


def test_database_failures_return_sanitized_500(monkeypatch):
    def fail_query(*args, **kwargs):
        raise RuntimeError('secret db internals')
    from app import main
    from app.database import get_session
    class BrokenSession:
        def scalars(self, query):
            fail_query()
    def override_broken_session():
        yield BrokenSession()
    app.dependency_overrides[get_session] = override_broken_session
    try:
        from fastapi.testclient import TestClient as IsolatedTestClient
        response = IsolatedTestClient(app, raise_server_exceptions=False).get('/api/incidents/summary')
    finally:
        app.dependency_overrides[get_session] = override_session
    assert response.status_code == 500
    assert 'secret db internals' not in response.text
    assert 'Traceback' not in response.text
