package main

import (
	"fmt"
	// "log"
	"net/http"
	"time"

	"github.com/Maheshkarri4444/wtexamify/routes"
	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	// "github.com/joho/godotenv"
)

func main() {
	fmt.Println("Welcome to Examify backend")

	// err := godotenv.Load()
	// if err != nil {
	// 	log.Fatal("Error loading .env file")
	// }

	r := gin.Default()
	r.Use(cors.New(cors.Config{
		AllowOrigins:     []string{"https://wtlabexam.vercel.app"}, // Change to your frontend URL
		AllowMethods:     []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Authorization"},
		ExposeHeaders:    []string{"Content-Length"},
		AllowCredentials: true,
		MaxAge:           12 * time.Hour,
	}))

	r.GET("/", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"message": "Server is running!"})
	})

	routes.AuthRoutes(r)
	routes.AnswerSheetRoutes(r)
	routes.ExamRoutes(r)
	routes.AiRoutes(r)

	// port := os.Getenv("PORT")
	// if port == "" {
	port := "8080"
	//}
	fmt.Println("🚀 Detected PORT:", port)
	fmt.Println("🌍 Binding server to 0.0.0.0:" + port)

	if err := r.Run("0.0.0.0:" + port); err != nil {
		fmt.Println("❌ Server failed to start:", err)
	}
}
