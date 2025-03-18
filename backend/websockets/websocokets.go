package websockets

import (
	"fmt"
	"sync"

	"github.com/gorilla/websocket"
)

type WebSocketManager struct {
	clients map[*websocket.Conn]bool
	mu      sync.Mutex
}

var Manager = &WebSocketManager{
	clients: make(map[*websocket.Conn]bool),
}

// AddClient registers a new WebSocket client
func (m *WebSocketManager) AddClient(conn *websocket.Conn) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.clients[conn] = true
}

// RemoveClient unregisters a WebSocket client
func (m *WebSocketManager) RemoveClient(conn *websocket.Conn) {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.clients, conn)
	conn.Close()
}

// Broadcast sends a message to all clients
func (m *WebSocketManager) Broadcast(message []byte) {
	m.mu.Lock()
	defer m.mu.Unlock()
	for conn := range m.clients {
		if err := conn.WriteMessage(websocket.TextMessage, message); err != nil {
			fmt.Println("Error broadcasting:", err)
			conn.Close()
			delete(m.clients, conn)
		}
	}
}
