package routes

import (
	"github.com/Maheshkarri4444/wtexamify/controllers"
	"github.com/Maheshkarri4444/wtexamify/middleware"
	"github.com/gin-gonic/gin"
)

func AnswerSheetRoutes(router *gin.Engine) {
	answersheet := router.Group("/answersheets")
	{
		answersheet.POST("/create", middleware.StudentMiddleware(), controllers.CreateAnswerSheet)
		answersheet.PUT("/submit", middleware.StudentMiddleware(), controllers.UpdateExam)
	}
}
