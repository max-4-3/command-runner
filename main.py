from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
import uvicorn

from src.api import router

app = FastAPI(debug=True)
app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_credentials=True
)
app.mount("/static", StaticFiles(directory="./static/"), "static")
app.include_router(router, prefix="/api")


@app.get("/")
async def root():
    return FileResponse("./pages/index.html")


if __name__ == "__main__":
    uvicorn.run("main:app", port=9090, reload=True)
