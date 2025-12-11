from typing import Any, Optional

from fastapi import HTTPException
from fastapi.responses import StreamingResponse

from src.api import router
from src.helper.command_runner import json, run_command


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
async def save_task(task: dict):
    pass
