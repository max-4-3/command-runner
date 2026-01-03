from typing import Any, Optional

from fastapi import Body, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlmodel import Session, select

from src.api import router
from src.helper.command_runner import json, run_command
from src.database.models import TaskClient
from src.database.session import create_session
from src.database.orm import save_client_task


@router.get("/run")
async def run(command: str, args: Optional[Any]):
    if args:
        try:
            args = json.loads(args)
        except:
            raise HTTPException(
                400,
                detail="Invalid 'args': expected a URI-decoded, JSON-encoded flat array of strings.",
            )

    try:
        event_stream = run_command(command, args)
    except Exception as e:
        raise HTTPException(500, detail=str(e))

    return StreamingResponse(
        event_stream,
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        },
    )


@router.post("/save")
async def save_task(
    task: TaskClient = Body(...), session: Session = Depends(create_session)
):
    if not task.fullLog:
        raise HTTPException(400, "Log is empty")

    await save_client_task(task, session)
    session.refresh(task)
    return {"saved": task}


@router.get("/all", response_model=list[TaskClient])
async def get_tasks(
    offset: int = 0, limit: int = 10, session: Session = Depends(create_session)
):
    return session.exec(select(TaskClient).offset(offset).limit(min(limit, 10))).all()

@router.get("/{task_id}", response_model=TaskClient)
async def get_task(task_id: str, session: Session = Depends(create_session)):
    return session.exec(select(TaskClient).where(TaskClient.id == task_id)).one_or_none()
