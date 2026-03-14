import os
import signal
import subprocess
import sys
import time


def worker_command():
    return [sys.executable, "-m", "app.workers.runner"]


def spawn_worker(index: int):
    env = os.environ.copy()
    env["WORKER_CHILD_INDEX"] = str(index)
    return subprocess.Popen(worker_command(), env=env)


def terminate_children(children):
    for child in children:
        if child.poll() is None:
            child.terminate()

    deadline = time.time() + 10
    for child in children:
        if child.poll() is not None:
            continue
        timeout = max(0, deadline - time.time())
        try:
            child.wait(timeout=timeout)
        except subprocess.TimeoutExpired:
            child.kill()


def main():
    concurrency = max(1, int(os.environ.get("WORKER_CONCURRENCY", "5")))
    children = [spawn_worker(index) for index in range(concurrency)]
    stopping = False

    def handle_signal(signum, frame):
        nonlocal stopping
        stopping = True
        terminate_children(children)

    signal.signal(signal.SIGTERM, handle_signal)
    signal.signal(signal.SIGINT, handle_signal)

    try:
        while not stopping:
            for child in children:
                code = child.poll()
                if code is not None:
                    stopping = True
                    terminate_children(children)
                    raise SystemExit(code)
            time.sleep(1)
    finally:
        terminate_children(children)


if __name__ == "__main__":
    main()
