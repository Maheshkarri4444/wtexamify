package main

import (
	"fmt"
	"net/http"
	"time"

	"github.com/Maheshkarri4444/wtexamify/config.go"
	"github.com/Maheshkarri4444/wtexamify/exams"
	"github.com/Maheshkarri4444/wtexamify/routes"
	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

func main() {
	fmt.Println("Welcome to Examify backend")

	r := gin.Default()
	if err := r.SetTrustedProxies([]string{"127.0.0.1", "::1"}); err != nil {
		fmt.Println("❌ Invalid trusted proxies:", err)
	}
	r.Use(cors.New(cors.Config{
		AllowOrigins:     allowedOrigins(),
		AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Authorization"},
		ExposeHeaders:    []string{"Content-Length"},
		AllowCredentials: true,
		MaxAge:           12 * time.Hour,
	}))

	r.GET("/", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"message": "Server is running!"})
	})

	routes.AuthRoutes(r)
	exams.RegisterRoutes(r)
	exams.Start()

	port := config.Get("PORT", "8080")
	if config.IsDevelopment() {
		fmt.Println("🧪 Development mode: /auth/dev-login is enabled for localhost")
	}
	fmt.Println("🌍 Binding server to 0.0.0.0:" + port)

	if err := r.Run("0.0.0.0:" + port); err != nil {
		fmt.Println("❌ Server failed to start:", err)
	}
}

// allowedOrigins comes from CORS_ORIGINS (comma-separated) or falls back to the deployed frontends.
func allowedOrigins() []string {
	if origins := config.List("CORS_ORIGINS"); len(origins) > 0 {
		return origins
	}
	return []string{"https://labexamsrgukt.vercel.app", "https://vastlabs.netlify.app", "http://localhost:5173"}
}
