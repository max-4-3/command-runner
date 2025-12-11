const output = document.getElementById("output-progress");
const taskForm = document.querySelector("form");
const newArgBtn = document.getElementById("new-arg");
const argsList = document.getElementById("args");
const tasks = JSON.parse(localStorage.getItem("tasks") || "[]");
const allTasks = {};

/**
 * save form state
 */
function saveFormState() {
	const command = taskForm.querySelector('select[name="command"]').value;

	const args = [...argsList.children].map((li) => ({
		key: li.querySelector('input[name="arg-key"]').value,
		value: li.querySelector('input[name="arg-value"]').value,
	}));

	localStorage.setItem("formState", JSON.stringify({ command, args }));
}

/**
 * load form state
 */
function loadFormState() {
	const saved = JSON.parse(localStorage.getItem("formState") || "null");
	if (!saved) return;

	// Restore command
	const cmdInput = taskForm.querySelector('input[name="command"]');
	if (cmdInput) cmdInput.value = saved.command || "";

	// Clear existing arg rows
	argsList.innerHTML = "";

	if (saved.args?.length) {
		for (const { key, value } of saved.args) {
			const li = document.createElement("li");
			li.innerHTML = `
				<input type="text" name="arg-key" placeholder="--url / --id / --output" required value="${key || ""}"/>
				<input type="text" name="arg-value" placeholder="value" value="${value || ""}"/>
				<button id="delete" type="button" class="btn btn-delete">
					<i class="fas fa-times"></i>
				</button>
			`;
			li.querySelector("button#delete").onclick = () => {
				if (argsList.children.length > 1) li.remove();
			};
			argsList.appendChild(li);
		}
	}

	// Ensure at least 1 row exists
	if (argsList.children.length === 0) createNewArgRow();
}

/**
 * Updates current task status
 */
function updateCurrentTask({ id, status }) {
	const currentTask = allTasks[id];
	if (!currentTask) {
		console.error("Can't update task which is not found:", id);
		return;
	}
	currentTask.status = status;
}

/**
 * Saves current task to local storage
 */
function saveCurrentTask({ id }) {
	const currentTask = allTasks[id];
	if (!currentTask) {
		console.error("Can't save task which is not found:", id);
		return;
	}

	const root = document.querySelector(
		`[data-id="${currentTask.id}"] #full-log`,
	);
	currentTask.fullLog = root
		? Array.from(root.querySelectorAll("p"), (p) => p.textContent)
		: [];
	tasks.push(currentTask);
	localStorage.setItem("tasks", JSON.stringify(tasks));
}

/**
 * Creates a new argument input row.
 */
function createNewArgRow() {
	if (!taskForm.checkValidity()) return taskForm.reportValidity();

	const newLi = document.createElement("li");
	newLi.innerHTML = `
        <input type="text" name="arg-key" placeholder="--url / --id / --output" required/>
        <input type="text" name="arg-value" placeholder="value" />
        <button id="delete" type="button" class="btn btn-delete">
            <i class="fas fa-times"></i>
        </button>
    `;

	// Deletes the argument row, but ensures at least one row remains
	newLi.querySelector("button#delete").onclick = () => {
		if (argsList.children.length > 1) {
			newLi.remove();
		} else {
			taskForm.reportValidity();
		}
	};

	argsList.appendChild(newLi);
	newLi.querySelector("[required]")?.focus();
}

/**
 * Runs a command and manages the SSE connection and progress updates.
 * @param {object} payload - The command and arguments.
 */
function runCommand({ command, args }) {
	const progress = document.createElement("div");
	progress.id = "progress";

	progress.innerHTML = `
        <div id="progress-container">
            <div id="progress-header">
                <div id="progress-title">${command} #${output.children.length + 1}</div>
                <div id="progress-icon"><i class="fas fa-spinner fa-spin"></i></div>
            </div>
            
			<div id="progress-bar">
				<div id="progress-report">
					<div id="progress-completed" style="width: 0%;"></div>
				</div>
				<span id="progress-percentage">0%</span>
			</div>
            
            <div id="progress-log">Waiting to start...</div>
            <div id="full-log" style="display: none;"></div>
        </div>
        <button id="clear" type="button" disabled><i class="fas fa-trash"></i></button>
        `;

	const logElem = progress.querySelector("#progress-log");
	const fullLogElem = progress.querySelector("#full-log");
	const progressCompleted = progress.querySelector("#progress-completed");
	const progressPercentage = progress.querySelector("#progress-percentage");
	const progressIcon = progress.querySelector("#progress-icon");
	const clearButton = progress.querySelector("#clear");
	const currentTask = {
		id: crypto.randomUUID(),
		command,
		args,
		status: "running",
	};
	allTasks[currentTask.id] = currentTask;
	progress.dataset.id = currentTask.id;

	clearButton.onclick = () => {
		// Only allow clearing if the task is not running
		if (!progress.classList.contains("running")) {
			progress.remove();
		}
	};

	// Add new progress element to the top of the list and save it to localStorage
	output.prepend(progress);

	// encode args properly
	// args: array of argument strings (e.g., ["--foo", "bar", "--url", "test"])
	const encArgs = encodeURIComponent(JSON.stringify(args));
	const url = `/api/run?command=${command}&args=${encArgs}`;

	const eventSource = new EventSource(url);

	const logProcess = (m) => {
		logElem.textContent = m;
		fullLogElem ? (fullLogElem.innerHTML += `<p>${m}</p>`) : 0;
	};

	const logProgress = (data) => {
		const { downloaded, total } = data;
		const percent = (downloaded / total) * 100;

		progressCompleted.style.width = percent.toFixed(2) + "%";
		progressPercentage.textContent = percent.toFixed(1) + "%";

		// console.log({ data, percent });
		updateCurrentTask({ id: currentTask.id, status: "processing" });
	};

	eventSource.onopen = () => {
		console.log("SSE open");
		progress.classList.add("running");
		progress.scrollIntoView({ behavior: "smooth" });
		clearButton.disabled = true; // Cannot clear while running
	};

	eventSource.onerror = (e) => {
		console.error("SSE error:", e);
		progress.classList.remove("running");
		clearButton.disabled = false;
		saveCurrentTask({ id: currentTask.id });
		eventSource.close();
	};

	eventSource.addEventListener("log", (e) => {
		const { line } = JSON.parse(e.data);
		logProcess(line);
	});

	eventSource.addEventListener("progress", (e) => {
		logProgress(JSON.parse(e.data).log);
	});

	eventSource.addEventListener("process_error", (e) => {
		const { log } = JSON.parse(e.data);
		progress.classList.remove("running");
		progress.classList.add("failed");
		updateCurrentTask({ id: currentTask.id, status: "failed" });
		progressIcon.innerHTML = `<i class="fas fa-exclamation-circle"></i>`;
		clearButton.disabled = false;
		eventSource.close();
		logProcess(log);
	});

	eventSource.addEventListener("completed", () => {
		progressCompleted.style.width = "100%";
		progressPercentage.textContent = "100%";
		progress.classList.remove("running");
		progress.classList.add("completed");
		updateCurrentTask({ id: currentTask.id, status: "completed" });
		progressIcon.innerHTML = `<i class="fas fa-check-circle"></i>`;
		clearButton.disabled = false;
		logProcess("Completed!");
	});
}

// Attach event listeners
newArgBtn.addEventListener("click", createNewArgRow);

taskForm.addEventListener("change", saveFormState);
taskForm.addEventListener("input", saveFormState);
taskForm.addEventListener("submit", (e) => {
	e.preventDefault();
	if (!taskForm.checkValidity()) return taskForm.reportValidity();

	const formData = new FormData(taskForm);

	const command = formData.get("command");
	const args = Array.from(formData.values()).filter(Boolean).splice(1); // Get all values leaving the first one as it is the `command` which is not neccesary and filter all

	const payload = {
		command,
		args,
	};

	runCommand(payload);
	saveFormState();
});

// Initial load: create the first argument row
argsList.children.length === 0 && createNewArgRow();

document.addEventListener("DOMContentLoaded", loadFormState);
