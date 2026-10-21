FROM python:3.11-slim-bookworm
COPY --from=ghcr.io/astral-sh/uv:0.13.4 /uv /uvx /usr/local/bin/
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && python -m pip install --no-cache-dir --no-deps --no-index "https://files.pythonhosted.org/packages/3f/06/3e4420302363fbb71be3c7f35ce042f54bfca330e3e66b3a2e3c4cca579f/pip-26.2.2-py3-none-any.whl#sha256=fd7f4dfa8190e014013b9f08f3e973f4e4c26ffd179a204895533a7254813a70" \
    && python -m pip install --no-cache-dir "certifi>=2026.10.19" \
    && if python -c "import ensurepip" >/dev/null 2>&1; then python -m pip download --no-cache-dir --no-deps --no-index -d /tmp/pip-seed "https://files.pythonhosted.org/packages/3f/06/3e4420302363fbb71be3c7f35ce042f54bfca330e3e66b3a2e3c4cca579f/pip-26.2.2-py3-none-any.whl#sha256=fd7f4dfa8190e014013b9f08f3e973f4e4c26ffd179a204895533a7254813a70" \
    && python -c "import ensurepip,pathlib,shutil; p=pathlib.Path(ensurepip.__file__); p.write_text(p.read_text().replace(ensurepip._PIP_VERSION,'26.2.2')); b=p.parent/'_bundled'; [x.unlink() for x in b.glob('pip-*.whl')]; shutil.copy('/tmp/pip-seed/pip-26.2.2-py3-none-any.whl',b)" \
    && rm -rf /tmp/pip-seed \
    && python -c "import ensurepip; assert ensurepip.version() == '26.2.2'"; fi


ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

COPY apps/worker/pyproject.toml /app/pyproject.toml
COPY apps/worker/uv.lock /app/uv.lock
RUN uv sync --frozen --no-dev

COPY apps/worker /app

RUN mkdir -p /data/fastf1-cache

EXPOSE 8080

CMD ["/usr/local/bin/uv", "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]
