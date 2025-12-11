# Command Runner

Command Runner is a small Python web application and a practice project focused on Server-Sent Events (SSE). It's intended as a learning playground to explore building realtime one-way event streams from a Python ASGI server to browsers, and to practice related frontend and backend patterns.

This repository uses the "uv" Python package manager (the repo contains uv.lock) for dependency management and reproducible installs.

Why this project
- Practice and experimentation with Server-Sent Events (SSE) in Python and the browser.
- Learn how to structure an ASGI app that emits events and a minimal frontend that consumes them.
- Improve skills with a lightweight Python package manager (uv) and modern ASGI servers.

Key points
- SSE-first: The app demonstrates Server-Sent Events (text/event-stream) to push updates from server to client in real time without websockets.
- ASGI-compatible: The project is structured to run with an ASGI server such as uvicorn.
- uv-based: Dependency lockfile is provided (uv.lock) and this project uses the uv package manager for dependency management.

Quickstart (recommended)
1. Clone the repository

   git clone https://github.com/max-4-3/command-runner.git
   cd command-runner

2. Install dependencies with uv

   # Install dependencies from pyproject.toml / uv.lock using uv
   uv install

   If you don't have uv installed, follow uv's installation instructions. Alternatively, use your preferred tool to install from pyproject.toml.

3. Run the app

   # Typical ASGI run (adjust module/path if different)
   uvicorn main:app --reload --host 0.0.0.0 --port 8000

   Or run the project using whatever entrypoint is defined in main.py if the project boots itself.

4. Open the app

   Visit: http://127.0.0.1:8000/ and open the browser DevTools Network tab to observe the SSE connection (look for a request with "text/event-stream").

SSE notes and tips
- The client subscribes to a text/event-stream endpoint exposed by the server (EventSource in the browser).
- SSE provides a simple, reliable way to stream server events to browsers (one-way from server to client). It's well-suited for notifications, logs, progress updates, and other use cases where the client only needs to receive updates.
- Pay attention to reconnection behavior: EventSource automatically reconnects; you can control retry intervals on the server with the "retry" field if needed.
- If you later need two-way comms, consider adding websockets; for many use cases SSE is simpler and lighter.

Security and safety
- If the project executes shell commands or runs user-supplied commands, treat it with extreme caution. Sanitize inputs, disallow arbitrary commands for untrusted users, and run in restricted environments.

Project layout (observed)
- main.py           — application entrypoint (ASGI app)
- pyproject.toml    — project metadata and dependencies
- uv.lock           — uv lockfile for reproducible installs
- src/              — source code directory
- static/           — static assets (HTML/CSS/JS)
- pages/            — UI/pages

Development notes
- Use an isolated virtual environment or container for development.
- Run the server with uvicorn for local development to get autoreload and faster iteration.

Contributing
Contributions and suggestions are welcome. If you'd like, I can:
- Expand this README with examples taken directly from the code (client JS showing EventSource, server endpoint implementation in main.py),
- Add a short tutorial / walkthrough that demonstrates emitting example SSE messages and consuming them in the browser,
- Add tests or linters to the repo.

License
No license file found in the repository. Consider adding an explicit license (MIT, Apache-2.0, etc.) if you plan to make this public.

Maintainer
- GitHub: https://github.com/max-4-3
- Repo: https://github.com/max-4-3/command-runner


(This README was generated and pushed by an assistant based on the repository structure and your notes about SSE and uv.)
