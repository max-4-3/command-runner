import asyncio
import json
from pathlib import Path
from typing import Optional

from .consts import OUTPUT_TEMPLATE, YT_AUDIO, YT_VIDEO


async def run_command(command_root: str, flat_args: Optional[list[str]]):
    if not command_root.startswith("yt_"):
        raise NotImplementedError(f"'{command_root}' is not currently supported!")

    flat_args = flat_args or []
    if len(flat_args) < 1:
        raise ValueError("A video URL is required")

    # Helper to format SSE event
    def format_sse(data, event=None):
        event_line = f"event: {event}\n" if event else ""
        return f"{event_line}data: {json.dumps(data)}\n\n"

    # Build command
    is_audio = command_root == "yt_audio"
    video_url = flat_args.pop(0)

    # Path Creation
    output_dir = Path("~") / (is_audio and "Music" or "Videos") / "%(extractor)s"

    # Checks whether seconds argument is not a command argument ( not starting with - )
    if len(flat_args) >= 2 and not flat_args[1].startswith("-"):
        # pop at index 0 because last pop causes the index to -1
        output_dir = Path(flat_args.pop(0))
    output_dir /= OUTPUT_TEMPLATE

    # Creates a deepcopy of all items for local uses
    command = [i for i in is_audio and YT_AUDIO or YT_VIDEO]
    command.extend(
        [
            "-o",
            output_dir.expanduser().resolve(),  # sets up output template ( output dir )
        ]
        + flat_args  # additional argument passed straight to yt-dlp
        + [video_url]  # lastly the video url
    )
    command = list(
        filter(
            bool, map(str, command)
        )  # creates the final command via mapping str to all entries and filtering all not truthy values
    )

    # Send starting event
    yield format_sse({"status": "starting", "command": command}, "starting")

    # Start process
    process = await asyncio.create_subprocess_exec(
        *command,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )

    # Read stdout line by line
    while True:
        line = (
            (
                await process.stdout.readline()  # pyright: ignore[reportOptionalMemberAccess]
            )
            .decode(errors="ignore")
            .strip()
        )
        if not line:
            break

        parts = line.split()
        if len(parts) == 2 and all([a.isdigit() for a in parts]):
            downloaded, total = parts

            yield format_sse(
                {
                    "status": "progress",
                    "log": {"downloaded": downloaded, "total": total},
                },
                "progress",
            )
        else:
            # Non-progress logs
            yield format_sse({"status": "log", "line": line}, "log")

    # Wait for final exit
    r_code = await process.wait()

    # Send proper event according to r_code
    if r_code == 0:
        yield format_sse({"status": "completed"}, "completed")
    elif process.stderr:
        yield format_sse(
            {
                "status": "process_error",
                "log": (await process.stderr.read()).decode(errors="ignore"),
            },
            "process_error",
        )
    else:
        yield format_sse(
            {"status": "process_error", "log": "Unexpected error occured!"},
            "process_error",
        )
