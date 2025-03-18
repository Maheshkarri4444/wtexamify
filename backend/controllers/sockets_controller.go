package controllers

import (
	"fmt"
	"net/http"

	"github.com/Maheshkarri4444/wtexamify/websockets"
	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true // Allow all connections for now
	},
}

func WatchAnswerSheets(c *gin.Context) {
	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		fmt.Println("WebSocket upgrade failed:", err)
		return
	}

	websockets.Manager.AddClient(conn)
	defer websockets.Manager.RemoveClient(conn)

	// Keep the connection open
	for {
		_, _, err := conn.ReadMessage()
		if err != nil {
			fmt.Println("Client disconnected:", err)
			break
		}
	}
}
