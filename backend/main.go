package main

import (
	"fmt"
	"log"
	"os"
	"time"

	"github.com/Maheshkarri4444/wtexamify/routes"
	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
)

func main() {
	fmt.Println("Welcome to Examify backend")
	err := godotenv.Load()
	if err != nil {
		log.Fatal("Error loading .env file")
	}

	r := gin.Default()
	r.Use(cors.New(cors.Config{
		AllowOrigins:     []string{"http://localhost:5173"}, // Change to your frontend URL
		AllowMethods:     []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Authorization"},
		ExposeHeaders:    []string{"Content-Length"},
		AllowCredentials: true,
		MaxAge:           12 * time.Hour,
	}))

	routes.AnswerSheetRoutes(r)

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	fmt.Println("Server running on port:", port)
	r.Run(":" + port)
}
