YT_BASE = [
    "yt-dlp",
    "-w",
    "-N",
    4,
    "--restrict-filename",
    "--embed-thumbnail",
    "--embed-chapters",
    "--add-metadata",
    "--embed-subs",
    "--newline",
    "--progress-template",
    "%(progress.downloaded_bytes)s %(progress.total_bytes)s",
]
YT_AUDIO = YT_BASE + ["-f", "ba[ext=m4a]/ba", "-x", "--audio-format", "mp3"]
YT_VIDEO = YT_BASE + [
    "-f",
    "bv*[ext=mp4]+ba[ext=m4a]/b",
    "--merge-output-format",
    "mp4",
]
OUTPUT_TEMPLATE = "%(title)s [%(uploader)s@%(extractor)s] [%(id)s].%(ext)s"
