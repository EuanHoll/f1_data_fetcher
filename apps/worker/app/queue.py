from redis import Redis
from rq import Queue

from app.config import get_queue_name, get_valkey_url


def get_connection():
    return Redis.from_url(get_valkey_url())


def get_queue(default_timeout: int = 60 * 60 * 4):
    return Queue(get_queue_name(), connection=get_connection(), default_timeout=default_timeout)
