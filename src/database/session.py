from sqlmodel import create_engine, Session
from .models import SQLModel
from . import DB_URL

engine = create_engine(DB_URL)
SQLModel.metadata.create_all(engine)

async def create_session():
    yield Session(engine)
