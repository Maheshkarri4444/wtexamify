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
		answersheet.PUT("/submit", middleware.StudentMiddleware(), controllers.SubmitAnswerSheet)

		answersheet.PUT("/answersheet/:id/assigncopied", middleware.StudentMiddleware(), controllers.AssignCopied)
		answersheet.PUT("/answersheet/:id/removecopied", middleware.StudentMiddleware(), controllers.RemoveCopied)

		answersheet.GET("/submitted/:examID", middleware.TeacherMiddleware(), controllers.GetAllSubmittedAnswerSheets)
		answersheet.GET("/:id", middleware.StudentOrTeacherMiddleware(), controllers.GetAnswerSheetByID)

	}

	router.GET("/watch/answersheets", controllers.WatchAnswerSheets) // WebSocket connection
	router.PUT("/refresh/answersheet/:id", controllers.RefreshAnswerSheet)
}
