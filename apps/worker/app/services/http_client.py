import requests


def create_http_session():
    session = requests.Session()
    session.headers.update({"content-type": "application/json"})
    return session


def post_json(http_session, url: str, api_key: str, payload):
    response = http_session.post(url, json=payload, headers={"x-ingest-key": api_key}, timeout=180)
    if response.status_code >= 400:
        print(f"Request failed ({response.status_code}): {response.text}")
        response.raise_for_status()
    return response.json()
