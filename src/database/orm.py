from .models import TaskClient
from sqlmodel import Session

async def save_client_task(task: TaskClient, session: Session):
    session.add(task)
    session.commit()

