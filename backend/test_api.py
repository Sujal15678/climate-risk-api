"""Minimal API tests.

These run against the local storage backend, so no AWS credentials or network
access to S3 is needed. The Open-Meteo call in the store endpoint is the one
external dependency, so tests here focus on validation and file retrieval,
which are the parts most likely to regress.
"""

from datetime import date, timedelta

from fastapi.testclient import TestClient

from main import app

client = TestClient(app)


def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_rejects_out_of_range_latitude():
    response = client.post("/store-weather-data", json={
        "latitude": 120,
        "longitude": 72.57,
        "start_date": "2024-07-01",
        "end_date": "2024-07-15",
    })
    assert response.status_code == 422


def test_rejects_reversed_dates():
    response = client.post("/store-weather-data", json={
        "latitude": 23.02,
        "longitude": 72.57,
        "start_date": "2024-07-15",
        "end_date": "2024-07-01",
    })
    assert response.status_code == 422


def test_rejects_range_longer_than_31_days():
    response = client.post("/store-weather-data", json={
        "latitude": 23.02,
        "longitude": 72.57,
        "start_date": "2024-01-01",
        "end_date": "2024-03-01",
    })
    assert response.status_code == 422
    assert "maximum is 31" in response.text


def test_rejects_future_end_date():
    future = (date.today() + timedelta(days=10)).isoformat()
    response = client.post("/store-weather-data", json={
        "latitude": 23.02,
        "longitude": 72.57,
        "start_date": date.today().isoformat(),
        "end_date": future,
    })
    assert response.status_code == 422


def test_missing_file_returns_404():
    response = client.get("/weather-file-content/does-not-exist.json")
    assert response.status_code == 404
    assert response.json()["detail"]["message"] == "not found"


def test_list_returns_expected_shape():
    response = client.get("/list-weather-files")
    assert response.status_code == 200
    assert "files" in response.json()