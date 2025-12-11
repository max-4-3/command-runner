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

    return StreamingResponse(
        run_command(command, args),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        },
    )

@router.post("/save")
async def save_task(task: dict):
    pass
