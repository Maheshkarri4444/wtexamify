package routes

import (
	"github.com/Maheshkarri4444/wtexamify/config.go"
	"github.com/Maheshkarri4444/wtexamify/controllers"
	"github.com/gin-gonic/gin"
)

func AuthRoutes(r *gin.Engine) {
	auth := r.Group("/auth")
	{
		auth.GET("/google", controllers.GoogleLogin)
		auth.GET("/googlecallback", controllers.GoogleCallback)
		if config.IsDevelopment() {
			auth.POST("/dev-login", controllers.DevLogin)
		}
	}

}
