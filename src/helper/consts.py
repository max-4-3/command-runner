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
YT_AUDIO = YT_BASE + ["-f", "ba", "--audio-format", "mp3", "-x"]
YT_VIDEO = YT_BASE + ["-f", "bv+ba", "--audio-format", "mp3"]
OUTPUT_TEMPLATE = "%(title)s [%(uploader)s@%(extractor)s] [%(id)s].%(ext)s"
