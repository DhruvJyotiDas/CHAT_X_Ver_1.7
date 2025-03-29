// === CLEANED + WORKING script.js ===

let socket;
let username;
let authToken;
let selectedRecipient = null;
const X_BOT_USERNAME = "X Bot";
const CONNECTION_STATES = {
  CONNECTING: 'Connecting...',
  CONNECTED: 'Connected!',
  DISCONNECTED: 'Disconnected',
  ERROR: 'Connection Error'
};

const terminalText = document.querySelector('.terminal-loader .text');
const progressBar = document.querySelector('.progress');

function updateConnectionState(state) {
  terminalText.textContent = state;
  switch(state) {
    case CONNECTION_STATES.CONNECTED:
      terminalText.style.color = '#4CAF50';
      progressBar.style.background = 'linear-gradient(90deg, #4CAF50, #8BC34A)';
      break;
    case CONNECTION_STATES.ERROR:
      terminalText.style.color = '#F44336';
      progressBar.style.background = '#F44336';
      break;
    case CONNECTION_STATES.DISCONNECTED:
      terminalText.style.color = '#FFC107';
      progressBar.style.background = '#FFC107';
      break;
    default:
      terminalText.style.color = '#2196F3';
      progressBar.style.background = 'linear-gradient(90deg, #2196F3, #03A9F4)';
  }
}

updateConnectionState(CONNECTION_STATES.CONNECTING);

async function connectToServer() {
  username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value;

  if (!username || !password) {
    alert("Please enter both username and password.");
    return;
  }

  try {
    updateConnectionState(CONNECTION_STATES.CONNECTING);

    const response = await fetch('/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Login failed');

    authToken = data.token || "fake-token"; // Ensure it has some value
    username = data.username;

    socket = new WebSocket("ws://localhost:8000");

    const connectionTimeout = setTimeout(() => {
      if (socket.readyState !== WebSocket.OPEN) {
        updateConnectionState(CONNECTION_STATES.ERROR);
        alert('Connection timed out. Please try again.');
        socket.close();
      }
    }, 5000);

    socket.onopen = () => {
      clearTimeout(connectionTimeout);

      socket.send(JSON.stringify({
        type: "connect",
        username,
        token: authToken
      }));

      const authTimeout = setTimeout(() => {
        updateConnectionState(CONNECTION_STATES.ERROR);
        alert('Authentication timed out');
        socket.close();
      }, 2000);

      const tempHandler = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === "connect-response") {
          clearTimeout(authTimeout);
          socket.removeEventListener('message', tempHandler);

          if (data.success) {
            updateConnectionState(CONNECTION_STATES.CONNECTED);
            document.getElementById("user-login").style.display = "none";
            document.getElementById("chat-area").style.display = "flex";
            socket.onmessage = handleSocketMessage;
          } else {
            updateConnectionState(CONNECTION_STATES.ERROR);
            alert('Authentication failed: ' + (data.error || 'Unknown error'));
            socket.close();
          }
        }
      };

      socket.addEventListener('message', tempHandler);
    };

    socket.onerror = (error) => {
      updateConnectionState(CONNECTION_STATES.ERROR);
      alert('WebSocket error. Please refresh.');
      console.error(error);
    };

    socket.onclose = () => {
      updateConnectionState(CONNECTION_STATES.DISCONNECTED);
      alert('WebSocket disconnected.');
    };

  } catch (err) {
    console.error("Login failed:", err);
    alert("Login failed: " + err.message);
  }
}

function handleSocketMessage(event) {
  const data = JSON.parse(event.data);

  if (data.type === "updateUsers") {
    console.log("Users:", data.users);
  } else if (data.type === "message") {
    console.log("Message:", data);
  } else {
    console.log("Other event:", data);
  }
}

// UI Trigger (index.html has login inputs)
document.getElementById("username")?.addEventListener("keydown", e => {
  if (e.key === "Enter") connectToServer();
});
document.getElementById("password")?.addEventListener("keydown", e => {
  if (e.key === "Enter") connectToServer();
});

// Fallback if button used
window.connectToServer = connectToServer;