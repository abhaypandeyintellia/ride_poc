import "./style.css";

const app = document.querySelector("#app");

app.innerHTML = `
  <main class="container">
    <h1>Ride Request Tester</h1>
    <p class="subtext">Sends POST requests to <code>/ride</code></p>
    <p class="subtext">
      WebSocket status:
      <strong id="ws-status">Connecting...</strong>
    </p>

    <form id="ride-form" class="card">
      <label>
        Pickup Latitude
        <input id="lat" type="number" step="any" value="12.9716" required />
      </label>
      <label>
        Pickup Longitude
        <input id="lon" type="number" step="any" value="77.5946" required />
      </label>
      <button id="submit-btn" type="submit">Create Ride</button>
    </form>

    <section class="card">
      <h2>Latest Response</h2>
      <pre id="result">No request yet.</pre>
    </section>

    <section class="card">
      <h2>Request Log</h2>
      <ul id="log"></ul>
    </section>

    <section class="card">
      <h2>Live Driver Events</h2>
      <ul id="events"></ul>
    </section>
  </main>
`;

const form = document.querySelector("#ride-form");
const latInput = document.querySelector("#lat");
const lonInput = document.querySelector("#lon");
const submitBtn = document.querySelector("#submit-btn");
const resultEl = document.querySelector("#result");
const logEl = document.querySelector("#log");
const eventsEl = document.querySelector("#events");
const wsStatusEl = document.querySelector("#ws-status");

function addLogLine(text) {
  const item = document.createElement("li");
  item.textContent = `[${new Date().toLocaleTimeString()}] ${text}`;
  logEl.prepend(item);
}

function addEventLine(text) {
  const item = document.createElement("li");
  item.textContent = `[${new Date().toLocaleTimeString()}] ${text}`;
  eventsEl.prepend(item);
}

function formatEventText(event) {
  if (event.action === "RIDE_ACCEPTED") {
    return `Ride ${event.rideId} accepted by ${event.driverId}`;
  }

  if (event.action === "RIDE_ALREADY_TAKEN") {
    return `${event.driverId} tried to accept ${event.rideId}, but it was already taken`;
  }

  if (event.action === "RIDE_REQUEST_DISPATCHED") {
    return `Ride ${event.rideId} dispatched to ${event.driversNotified} driver(s)`;
  }

  if (event.action === "DRIVER_CONNECTED") {
    return `Driver connected: ${event.driverId}`;
  }

  if (event.action === "DRIVER_DISCONNECTED") {
    return `Driver disconnected: ${event.driverId}`;
  }

  if (event.action === "DRIVER_ACCEPT_ATTEMPT") {
    return `${event.driverId} is attempting ride ${event.rideId}`;
  }

  return `${event.action} ${JSON.stringify(event)}`;
}

function connectObserverSocket() {
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  const ws = new WebSocket(`${protocol}://localhost:3000`);

  ws.addEventListener("open", () => {
    wsStatusEl.textContent = "Connected";
    ws.send(JSON.stringify({ type: "REGISTER_OBSERVER" }));
  });

  ws.addEventListener("close", () => {
    wsStatusEl.textContent = "Disconnected (retrying...)";
    setTimeout(connectObserverSocket, 1500);
  });

  ws.addEventListener("error", () => {
    wsStatusEl.textContent = "Connection error";
  });

  ws.addEventListener("message", (event) => {
    let msg;
    try {
      msg = JSON.parse(event.data);
    } catch {
      return;
    }

    if (msg.type === "OBSERVER_REGISTERED") {
      addEventLine("Observer registered");
      return;
    }

    if (msg.type === "EVENT" && msg.event?.action) {
      addEventLine(formatEventText(msg.event));
    }
  });
}

connectObserverSocket();

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const lat = Number(latInput.value);
  const lon = Number(lonInput.value);

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    resultEl.textContent = "Please enter valid numeric latitude and longitude.";
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = "Sending...";

  try {
    addLogLine(`POST /ride lat=${lat}, lon=${lon}`);

    const response = await fetch("/ride", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lat, lon }),
    });

    const data = await response.json();
    resultEl.textContent = JSON.stringify(data, null, 2);

    if (!response.ok) {
      addLogLine(`Error ${response.status}`);
      return;
    }

    addLogLine(`Success rideId=${data.rideId ?? "n/a"}`);
  } catch (error) {
    resultEl.textContent = error.message;
    addLogLine("Network error");
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Create Ride";
  }
});
