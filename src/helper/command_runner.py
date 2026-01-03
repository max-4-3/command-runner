import asyncio
import json
from os import execlpe
import re
from pathlib import Path
from typing import Optional

from .consts import OUTPUT_TEMPLATE, YT_AUDIO, YT_VIDEO


async def ffmpeg_runner(args: list[str] | None):
    def format_sse(data, event=None):
        event_line = f"event: {event}\n" if event else ""
        return f"{event_line}data: {json.dumps(data)}\n\n"

    args = list(args or [])
    if len(args) < 2:
        raise ValueError("At least one input and one output stream required")

    # output stream is always last
    output_stream = str(Path(args.pop(-1)).expanduser().resolve().absolute())

    # collect ALL inputs
    inputs: list[str] = []
    remaining: list[str] = []

    i = 0
    while i < len(args):
        if args[i] == "-i":
            if i + 1 >= len(args):
                raise ValueError("'-i' without input stream")
            inputs.append(args[i + 1])
            i += 2
        else:
            remaining.append(args[i])
            i += 1

    if not inputs:
        # fallback: assume first arg is input
        inputs.append(remaining.pop(0))

    # inject progress args (stderr)
    progress_args = ["-hide_banner", "-loglevel", "level+info"]

    final_command = [
        "ffmpeg",
        *progress_args,
        *sum((["-i", inp] for inp in inputs), []),
        "-n",   # exit if file exists
        *remaining,
        output_stream,
    ]

    # starting event
    yield format_sse(
        {
            "status": "starting",
            "command": final_command,
            "args": remaining,
        },
        "starting",
    )

    process = await asyncio.create_subprocess_exec(
        *final_command,
        stderr=asyncio.subprocess.PIPE,
    )

    _SENTRY = object()
    queue: asyncio.Queue[str | object] = asyncio.Queue()

    async def wait_for_process():
        try:
            await process.wait()
        finally:
            await queue.put(_SENTRY)

    async def read_stderr():
        time_pattern = re.compile(r"time=(\d+:\d+:\d+\.\d+)")
        duration_pattern = re.compile(r"Duration:\s*(\d+:\d+:\d+\.\d+)")
        total_duration, current_time = None, None

        def get_time(time_str: str) -> float:
            if len(time_str.split(":")) != 3:
                return 0.0

            hour, min, sec = map(float, time_str.split(":"))
            return 3600 * hour + 60 * min + sec

        while True:
            try:
                line = await process.stderr.readuntil((b"\n", b"\r"))  # type: ignore
                if not line:
                    break
            except asyncio.IncompleteReadError:
                break

            text = line.decode(errors="ignore")
            if not text.strip():
                continue

            if not text.startswith("[info]"):
                continue

            if (ctm := time_pattern.search(text)):
                current_time = get_time(ctm.group(1))
            elif (
                text.endswith("\n")
                and total_duration is None
                and (tdm := duration_pattern.search(text))
            ):
                total_duration = get_time(tdm.group(1))

            if current_time is not None and total_duration is not None:
                await queue.put(
                    format_sse(
                        {
                            "status": "progress",
                            "log": {
                                "downloaded": current_time,
                                "total": total_duration,
                            },
                        },
                        "progress",
                    )
                )
            else:
                await queue.put(format_sse({"status": "log", "line": text}, "log"))

    # run both readers concurrently
    tasks = [
        asyncio.create_task(read_stderr()),
        asyncio.create_task(wait_for_process()),
    ]

    try:
        while True:
            item = await queue.get()
            if item is _SENTRY:
                break
            yield item
    except asyncio.CancelledError:
        process.terminate()
        try:
            await asyncio.wait_for(process.wait(), timeout=2)
        except asyncio.TimeoutError:
            process.kill()
            await process.wait()
        
        for t in tasks:
            try:
                t.result()
            except:
                pass
        raise

    rc = process.returncode

    if rc == 0:
        yield format_sse({"status": "completed"}, "completed")
    else:
        yield format_sse(
            {"status": "process_error", "log": f"ffmpeg exited with code {rc}"},
            "process_error",
        )


async def yt_runner(command_root: str, flat_args: Optional[list[str]]):
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

    # Checks whether first argument is not a command argument ( not starting with - )
    # because the first first item in poped by above action ( to get video_url )
    if len(flat_args) >= 1 and not flat_args[0].startswith("-"):
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
    yield format_sse(
        {"status": "starting", "command": command, "args": flat_args}, "starting"
    )

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


def run_command(command_root: str, flat_args: Optional[list[str]]):
    if command_root.strip().startswith("yt_"):
        return yt_runner(command_root, flat_args)  # AsyncGenerator[str, Any]
    elif command_root.lower() == "ffmpeg":
        return ffmpeg_runner(flat_args)  # AsyncGenerator[str, Unknown | Any]
    else:
        return NotImplemented
