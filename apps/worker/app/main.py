from fastapi import FastAPI

from app.routes.jobs import router as jobs_router


app = FastAPI(title="F1 Ingest Worker", version="1.0.0")
app.include_router(jobs_router)
