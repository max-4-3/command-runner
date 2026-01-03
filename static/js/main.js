const output = document.getElementById("output-progress");
const taskForm = document.querySelector("form");
const newArgBtn = document.getElementById("new-arg");
const argsList = document.getElementById("args");
const tasks = JSON.parse(localStorage.getItem("tasks") || "[]");
const allTasks = {};

/**
 * UUID Fallback
 */
if (!crypto.randomUUID) {
	crypto.randomUUID = function() {
		if (crypto.getRandomValues) {
			const bytes = new Uint8Array(16);
			crypto.getRandomValues(bytes);

			// RFC 4122 compliance
			bytes[6] = (bytes[6] & 0x0f) | 0x40; // Version 4
			bytes[8] = (bytes[8] & 0x3f) | 0x80; // Variant 10

			const hex = [...bytes]
				.map((b) => b.toString(16).padStart(2, "0"))
				.join("");

			return (
				hex.slice(0, 8) +
				"-" +
				hex.slice(8, 12) +
				"-" +
				hex.slice(12, 16) +
				"-" +
				hex.slice(16, 20) +
				"-" +
				hex.slice(20)
			);
		}

		// LAST fallback (insecure)
		return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
			const r = (Math.random() * 16) | 0;
			const v = c === "x" ? r : (r & 0x3) | 0x8;
			return v.toString(16);
		});
	};
}

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
			createNewArgRow({ argKeyValue: key, argValueValue: value });
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

	if (currentTask.saved) return;

	const root = document.querySelector(
		`[data-id="${currentTask.id}"] #full-log`,
	);
	currentTask.fullLog = root
		? Array.from(root.querySelectorAll("p"), (p) => p.textContent)
		: [];
	tasks.push(currentTask);
	localStorage.setItem("tasks", JSON.stringify(tasks));
	currentTask.saved = true;
	fetch("/api/save", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(currentTask),
	})
		.then((res) => res.json())
		.then(console.log)
		.catch(console.error);
}

/**
 * Creates a new argument input row.
 */

function createNewArgRow({ argKeyValue = "", argValueValue = "" } = {}) {
	if (!taskForm.checkValidity()) return taskForm.reportValidity();

	const newLi = document.createElement("li");
	newLi.innerHTML = `
		<input type="text" name="arg-key" placeholder="--url / --id / --output" required value="${argKeyValue}" />
		<input type="text" name="arg-value" placeholder="value" value="${argValueValue}" />
		<button type="button" class="btn delete">
			<i class="fas fa-times"></i>
		</button>
	`;

	const deleteBtn = newLi.querySelector(".delete");

	deleteBtn.onclick = () => {
		// ensure at least one row stays active
		if (
			argsList.children.length <= 1 &&
			!newLi.classList.contains("disabled")
		) {
			taskForm.reportValidity();
			return;
		}

		const isDisabled = newLi.classList.contains("disabled");
		const inputs = newLi.querySelectorAll('input[type="text"]');
		const isEmpty = [...inputs].every((el) => el.value.trim() === "");

		if (isEmpty && argsList.children.length > 1) {
			newLi.remove();
			return;
		}

		inputs.forEach((el) => {
			if (isDisabled) {
				el.removeAttribute("disabled");
				if (el.name === "arg-key") el.setAttribute("required", "");
			} else {
				el.setAttribute("disabled", "");
				el.removeAttribute("required");
			}
		});

		newLi.classList.toggle("disabled", !isDisabled);

		deleteBtn.innerHTML = isDisabled
			? `<i class="fas fa-times"></i>`
			: `<i class="fas fa-check"></i>`;

		deleteBtn.style.background = isDisabled
			? "var(--color-fail)"
			: "var(--color-success)";
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
					<div id="progress-completed" style="width:0%;"></div>
				</div>
				<span id="progress-percentage">0%</span>
			</div>

			<div id="progress-log">Waiting to start...</div>
			<div id="full-log" style="display:none;"></div>
		</div>
		<div class="actions">
		<button id="cancel" type="button"><i class="fas fa-xmark"></i></button>
		<button id="clear" type="button" disabled><i class="fas fa-trash"></i></button>
		</div>
		`;

	const logElem = progress.querySelector("#progress-log");
	const fullLogElem = progress.querySelector("#full-log");
	const progressCompleted = progress.querySelector("#progress-completed");
	const progressPercentage = progress.querySelector("#progress-percentage");
	const progressIcon = progress.querySelector("#progress-icon");
	const clearButton = progress.querySelector("#clear");
	const canelButton = progress.querySelector("#cancel");

	const currentTask = {
		id: crypto.randomUUID(),
		command,
		args,
		status: "running",
	};

	allTasks[currentTask.id] = currentTask;
	progress.dataset.id = currentTask.id;

	// Clear button
	clearButton.onclick = () => {
		if (!progress.classList.contains("running")) progress.remove();
	};

	// Cancel button
	canelButton.onclick = () => {
		if (progress.classList.contains("running")) {
			completeProgress("cancel");
		}
	};

	output.prepend(progress);

	// --- SSE setup --------------------------------------------------------
	const encArgs = encodeURIComponent(JSON.stringify(args));
	const url = `/api/run?command=${command}&args=${encArgs}`;

	const eventSource = new EventSource(url);

	// --- Helper functions -------------------------------------------------
	const logProcess = (m) => {
		logElem.textContent = m;
		fullLogElem.innerHTML += `<p>${m}</p>`;
	};

	const logProgress = (data) => {
		const { downloaded, total } = data;
		const percent = (downloaded / total) * 100 || 0;

		progressCompleted.style.width = percent.toFixed(2) + "%";
		progressPercentage.textContent = percent.toFixed(1) + "%";

		updateCurrentTask({ id: currentTask.id, status: "processing" });
	};

	const finalize = (callback) => {
		clearButton.disabled = false;
		canelButton.disabled = true;
		saveCurrentTask({ id: currentTask.id });
		eventSource.close();
		callback?.({ progressElem: progress, currentTask });
	};

	// --- State machine -----------------------------------------------------
	const STATE = {
		completed: {
			icon: `<i class="fas fa-check-circle"></i>`,
			class: "completed",
			status: "completed",
			before: () => {
				progressCompleted.style.width = "100%";
				progressPercentage.textContent = "100%";
			},
			fallbackLog: "Completed!",
		},

		process_error: {
			icon: `<i class="fas fa-exclamation-circle"></i>`,
			class: "failed",
			status: "failed",
		},

		cancel: {
			icon: `<i class="fas fa-ban"></i>`,
			class: "completed",
			status: "cancelled",
			fallbackLog: "Cancelled!"
		},

		error: {
			icon: `<i class="fas fa-exclamation-circle"></i>`,
			class: "failed",
			status: "failed",
			fallbackLog: "Unexpected error",
		},
	};

	const completeProgress = (reason, extraLog = null) => {
		const cfg = STATE[reason];
		if (!cfg) return;

		// UI changes
		progressIcon.innerHTML = cfg.icon;
		progress.classList.remove("running");
		progress.classList.add(cfg.class);

		// Update task status
		updateCurrentTask({ id: currentTask.id, status: cfg.status });

		// Optional pre-finalize hook
		cfg.before?.();

		// Logging
		const msg = extraLog ?? cfg.fallbackLog;
		if (msg) logProcess(msg);

		// Cleanup
		finalize();
	};

	// --- SSE events -------------------------------------------------------
	eventSource.onopen = () => {
		progress.classList.add("running");
		progress.scrollIntoView({ behavior: "smooth" });
	};

	eventSource.onerror = (e) => {
		console.error("SSE error:", e);
		completeProgress("error");
	};

	eventSource.addEventListener("log", (e) => {
		logProcess(JSON.parse(e.data).line);
	});

	eventSource.addEventListener("progress", (e) => {
		logProgress(JSON.parse(e.data).log);
	});

	eventSource.addEventListener("process_error", (e) => {
		const { log } = JSON.parse(e.data);
		completeProgress("process_error", log);
	});

	eventSource.addEventListener("completed", () => {
		completeProgress("completed");
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
	const args = [];

	for (const argLi of document.querySelectorAll("ol#args li")) {
		if (argLi.classList.contains("disabled")) continue;
		const inputs = argLi.querySelectorAll('input[type="text"]');
		inputs.forEach((e) => {
			e.value && args.push(e.value);
		});
	}

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
