import os

from redis import Redis
from rq import Queue, Worker


def main():
    queue_name = os.environ.get("RQ_QUEUE_NAME", "ingest")
    valkey_url = os.environ.get("VALKEY_URL", "redis://127.0.0.1:6379/0")
    connection = Redis.from_url(valkey_url)

    queue = Queue(queue_name, connection=connection)
    worker = Worker([queue], connection=connection)
    worker.work()


if __name__ == "__main__":
    main()
